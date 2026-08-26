import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { glob } from "glob";
import { resolveIndexedExtensions } from "./anchors/index.js";
import {
	CONFIG_FILES,
	LOCAL_CONFIG_FILES,
	nodeIdFor,
	resolveDocsRoots,
	rootForNodeId,
} from "./config.js";
import { hashBytes, hashContent } from "./content.js";
import type { Freshness, Manifest, WeftConfig } from "./types.js";

/**
 * Matches the manifest output directory everywhere a docs root is globbed,
 * the same way chokidar's watcher ignores it. Applied on top of the config's
 * own `ignore` globs so a freshly written manifest never makes its own tree
 * look changed (DD-15). Applied only here, not in the indexer's globs — both
 * currently skip `.weft/` via glob's defaults, but they are not otherwise
 * kept in scope-agreement by this constant.
 *
 * Currently redundant in practice: `glob` excludes dot-directories from `**`
 * by default, so `.weft/` is already skipped before this pattern is ever
 * consulted — verified by calling the same globs below with `ignore: []` and
 * seeing no change. Kept anyway as the explicit statement of intent, and as
 * the only thing standing between a freshly-built manifest and a
 * self-invalidating loop the day one of *these* globs starts passing
 * `dot: true`. Note the guard is one-sided: if the *indexer's* globs gain
 * `dot: true` first, the indexer would see `.weft/` while this check still
 * ignores it, and the manifest would report permanently stale — a loud
 * failure rather than a silent one, but the fix then is to apply this
 * pattern on both sides.
 */
const IGNORE_MANIFEST_OUTPUT = "**/.weft/**";

/**
 * The config files present at the root: the project's config file, plus the
 * machine-local overlay if there is one. The local file only carries `repos`,
 * but a changed `repos` re-points every GitHub blob URL edge, so it is as
 * much an input to the graph as the committed config.
 */
function findConfigFiles(rootDir: string): string[] {
	const found: string[] = [];
	const first = CONFIG_FILES.find((file) => existsSync(resolve(rootDir, file)));
	if (first) found.push(resolve(rootDir, first));
	const local = LOCAL_CONFIG_FILES.find((file) => existsSync(resolve(rootDir, file)));
	if (local) found.push(resolve(rootDir, local));
	return found;
}

/**
 * Baseline hash of everything a manifest's own nodes cannot already tell you
 * changed: the sorted set of indexed file paths across every docs root, plus
 * the artifact paths a root's `artifacts` globs match, plus the content of
 * every input that is not itself a node — sidecar files, contribution files,
 * and the config files, including the machine-local overlay.
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
	// Resolved the same way the indexer resolves it, so a project that opted
	// extra extensions in via `extensions` config has those files in the
	// baseline too — a static default list here would silently miss them.
	const indexedExtensions = resolveIndexedExtensions(config);

	const paths: string[] = [];
	const inputs: string[] = [];

	for (const root of roots) {
		const docIds = new Set<string>();

		const docFiles = await glob(`**/*.{${indexedExtensions.join(",")}}`, {
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

	for (const configFile of findConfigFiles(config.rootDir)) {
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
		} catch (error) {
			// ENOENT is the expected case — a node with no file behind it, such
			// as one declared entirely by a contribution. Anything else
			// (permissions, transient IO) is a real failure: swallowing it here
			// would fail toward `fresh`, the one direction this module must
			// never fail toward, so let it propagate instead.
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}

		if (current !== node.contentHash) {
			return { status: "stale", builtAt: manifest.build.builtAt };
		}
	}

	return { status: "fresh", builtAt: manifest.build.builtAt };
}
