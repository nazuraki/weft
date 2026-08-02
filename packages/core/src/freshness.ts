import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { glob } from "glob";
import { INDEXED_EXTENSIONS } from "./anchors/index.js";
import { CONFIG_FILES, nodeIdFor, resolveDocsRoots, rootForNodeId } from "./config.js";
import { hashBytes, hashContent } from "./content.js";
import type { Freshness, Manifest, WeftConfig } from "./types.js";

/**
 * Matches the manifest output directory everywhere a docs root is globbed,
 * the same way chokidar's watcher ignores it. Applied on top of the config's
 * own `ignore` globs so a freshly written manifest never makes its own tree
 * look changed (DD-15) — the check and the indexer stay in scope-agreement.
 *
 * Currently redundant in practice: `glob` excludes dot-directories from `**`
 * by default, so `.weft/` is already skipped before this pattern is ever
 * consulted — verified by calling the same globs below with `ignore: []` and
 * seeing no change. Kept anyway as the explicit statement of intent, and as
 * the only thing standing between a freshly-built manifest and a
 * self-invalidating loop the day one of these globs starts passing `dot: true`.
 */
const IGNORE_MANIFEST_OUTPUT = "**/.weft/**";

/** The project's config file, if it has one. */
function findConfigFile(rootDir: string): string | undefined {
	for (const file of CONFIG_FILES) {
		const path = resolve(rootDir, file);
		if (existsSync(path)) return path;
	}
	return undefined;
}

/**
 * Baseline hash of everything a manifest's own nodes cannot already tell you
 * changed: the sorted set of indexed file paths across every docs root, plus
 * the artifact paths a root's `artifacts` globs match, plus the content of
 * every input that is not itself a node — sidecar files, contribution files,
 * and the config file.
 *
 * Every node already carries a `contentHash`, so an edited document's content
 * is not covered here — hashing it again would be redundant with the
 * manifest, and an artifact's bytes are deliberately not read here either.
 * What no amount of comparing existing nodes can detect is a node added or
 * deleted — document or artifact — or a change to one of the non-node
 * inputs, which is exactly what this hash covers instead.
 */
export async function computeInputsHash(config: WeftConfig): Promise<string> {
	const roots = resolveDocsRoots(config);
	const ignore = [...config.ignore, IGNORE_MANIFEST_OUTPUT];

	const paths: string[] = [];
	const inputs: string[] = [];

	for (const root of roots) {
		const docIds = new Set<string>();

		const docFiles = await glob(`**/*.{${INDEXED_EXTENSIONS.join(",")}}`, {
			cwd: root.absDir,
			ignore,
			nodir: true,
		});
		for (const file of docFiles) {
			const id = nodeIdFor(root, file);
			docIds.add(id);
			paths.push(id);
		}

		// Mirrors buildRootGraph/findArtifacts's own resolution of the artifacts
		// globs — a wide pattern that also catches an indexed document loses to
		// the document there, so the same dedup applies here.
		if (config.artifacts?.length) {
			const artifactFiles = await glob(config.artifacts, {
				cwd: root.absDir,
				ignore,
				nodir: true,
				posix: true,
			});
			for (const file of artifactFiles) {
				const id = nodeIdFor(root, file);
				if (!docIds.has(id)) paths.push(id);
			}
		}

		const sidecarFiles = await glob("**/*.weft", { cwd: root.absDir, ignore, nodir: true });
		for (const file of sidecarFiles) {
			const content = await readFile(resolve(root.absDir, file), "utf8");
			inputs.push(`${nodeIdFor(root, file)}:${hashContent(content)}`);
		}
	}

	if (config.contributions?.length) {
		const files = await glob(config.contributions, {
			cwd: config.rootDir,
			nodir: true,
			posix: true,
		});
		for (const file of files) {
			const content = await readFile(resolve(config.rootDir, file), "utf8");
			inputs.push(`${file}:${hashContent(content)}`);
		}
	}

	const configFile = findConfigFile(config.rootDir);
	if (configFile) {
		const content = await readFile(configFile, "utf8");
		inputs.push(`${basename(configFile)}:${hashContent(content)}`);
	}

	paths.sort();
	inputs.sort();
	return hashContent(JSON.stringify({ paths, inputs }));
}

/**
 * Compare a manifest's recorded provenance against the docs tree it claims to
 * describe.
 *
 * A document added, removed, or a changed non-node input is caught by
 * {@link computeInputsHash}. An edited document is not — nothing about its
 * path changes — so every node with a recorded hash is re-read and compared
 * against it. A node that no longer resolves to a real file is skipped rather
 * than treated as stale: that is a document Weft never indexed from disk in
 * the first place, such as one declared entirely by a contribution.
 */
export async function checkFreshness(manifest: Manifest, config: WeftConfig): Promise<Freshness> {
	if (!manifest.build) return { status: "unknown" };

	const inputsHash = await computeInputsHash(config);
	if (inputsHash !== manifest.build.inputsHash) {
		return { status: "stale", builtAt: manifest.build.builtAt };
	}

	const roots = resolveDocsRoots(config);
	for (const node of manifest.nodes) {
		if (!node.contentHash) continue;

		const match = rootForNodeId(roots, node.id);
		if (!match) continue;
		const filePath = resolve(match.root.absDir, match.relPath);

		let current: string;
		try {
			current =
				node.type === "artifact"
					? hashBytes(await readFile(filePath))
					: hashContent(await readFile(filePath, "utf8"));
		} catch {
			continue;
		}

		if (current !== node.contentHash) {
			return { status: "stale", builtAt: manifest.build.builtAt };
		}
	}

	return { status: "fresh", builtAt: manifest.build.builtAt };
}
