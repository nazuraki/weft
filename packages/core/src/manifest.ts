import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { glob } from "glob";
import {
	INDEXED_EXTENSIONS,
	extractAnchors,
	extractTitle,
	getDocType,
	isIndexedPath,
} from "./anchors/index.js";
import { extractMarkdownDescription } from "./anchors/markdown.js";
import { type DocsRoot, isNamespaced, nodeIdFor, projectRefs, resolveDocsRoots } from "./config.js";
import { countLines, hashBytes, hashContent } from "./content.js";
import { type LoadedContribution, applyContributions, loadContributions } from "./contributions.js";
import { computeInputsHash } from "./freshness.js";
import { parseFrontmatter } from "./frontmatter.js";
import { lastCommitDates } from "./git.js";
import { extractMarkdownLinks } from "./links/markdown.js";
import { extractSidecarLinks } from "./links/sidecar.js";
import { resolvePublishedLinks } from "./published-links.js";
import type {
	Manifest,
	ManifestBuild,
	ProjectManifest,
	SiteConfig,
	WeftConfig,
	WeftEdge,
	WeftNode,
} from "./types.js";

export { INDEXED_EXTENSIONS, isIndexedPath };

/**
 * Manifest schema version.
 *
 * 2 — `WeftNode.anchors` holds `Anchor` objects rather than bare slug strings,
 * and slugs now match GitHub's own slugger, so some anchor values changed.
 */
export const MANIFEST_VERSION = 2;

/** The nodes and edges discovered in a single docs root. */
export interface RootGraph {
	nodes: WeftNode[];
	edges: WeftEdge[];
}

/**
 * Scan one docs root. `roots` is the full set, so links leaving this root into
 * another project still resolve to a node id.
 */
export async function buildRootGraph(
	config: WeftConfig,
	root: DocsRoot,
	roots: DocsRoot[]
): Promise<RootGraph> {
	const docsDir = root.absDir;

	// Find all doc files
	const files = await glob(`**/*.{${INDEXED_EXTENSIONS.join(",")}}`, {
		cwd: docsDir,
		ignore: config.ignore,
		nodir: true,
	});

	// Find all sidecar files
	const sidecarFiles = await glob("**/*.weft", {
		cwd: docsDir,
		ignore: config.ignore,
		nodir: true,
	});

	// One history walk for the whole root, since every file read below wants a
	// date. Empty outside a git work tree, which is not an error.
	const modifiedDates = await lastCommitDates(docsDir);

	const nodes: WeftNode[] = [];
	const edges: WeftEdge[] = [];

	for (const file of files) {
		const absPath = resolve(docsDir, file);
		const docType = getDocType(file);
		if (!docType) continue;

		const raw = readFileSync(absPath, "utf-8");
		const { data: frontmatter, body } =
			docType === "markdown" ? parseFrontmatter(raw) : { data: {}, body: raw };

		const anchors = extractAnchors(body, docType);
		const title = frontmatter.title ?? extractTitle(body, docType) ?? file;

		const description =
			frontmatter.description ??
			(docType === "markdown" ? extractMarkdownDescription(body) : undefined);

		// git reports forward slashes on every platform, glob does not.
		const modified = modifiedDates.get(relative(docsDir, absPath).replace(/\\/g, "/"));

		nodes.push({
			id: nodeIdFor(root, relative(docsDir, absPath)),
			type: docType,
			title,
			anchors,
			// Computed here because the file is already in hand — no consumer of
			// these has to re-read the docs tree to get them.
			contentHash: hashContent(raw),
			lineCount: countLines(raw),
			...(frontmatter.version ? { version: frontmatter.version } : {}),
			...(modified ? { modified } : {}),
			...(root.slug ? { project: root.slug } : {}),
			...(frontmatter.theme ? { theme: frontmatter.theme } : {}),
			...(description ? { description } : {}),
			...(frontmatter.ogImage ? { ogImage: frontmatter.ogImage } : {}),
		});

		// Extract links from markdown files
		if (docType === "markdown") {
			edges.push(...extractMarkdownLinks(body, absPath, roots));
		}
	}

	nodes.push(...(await findArtifacts(config, root, new Set(nodes.map((node) => node.id)))));

	// Extract links from sidecar files
	for (const sidecarFile of sidecarFiles) {
		const absPath = resolve(docsDir, sidecarFile);
		const content = readFileSync(absPath, "utf-8");
		edges.push(...extractSidecarLinks(content, absPath, roots));
	}

	return { nodes, edges };
}

/**
 * Register the generated outputs configured for a root.
 *
 * An artifact is a node so an edge has something to point at, and nothing more:
 * no anchors to extract, no text to read, and never in the nav. The title is the
 * file name because a node must have one and a PDF does not offer a better
 * answer — nothing displays it, since `hiddenFromNav` keeps artifacts out of the
 * tree and consumers are expected to skip them.
 */
async function findArtifacts(
	config: WeftConfig,
	root: DocsRoot,
	indexed: Set<string>
): Promise<WeftNode[]> {
	if (!config.artifacts?.length) return [];

	const files = await glob(config.artifacts, {
		cwd: root.absDir,
		ignore: config.ignore,
		nodir: true,
		posix: true,
	});

	// Sorted so a manifest does not change purely because the filesystem
	// enumerated a directory differently. A pattern wide enough to catch an
	// indexed document loses to the document: it has anchors and content, and
	// replacing it with a hash and a file name would be a downgrade.
	return files
		.sort()
		.filter((file) => !indexed.has(nodeIdFor(root, file)))
		.map((file) => ({
			id: nodeIdFor(root, file),
			type: "artifact" as const,
			title: file.slice(file.lastIndexOf("/") + 1),
			anchors: [],
			// Bytes, not normalized text: an artifact is whatever it literally is.
			// No line count either — there are no lines to count.
			contentHash: hashBytes(readFileSync(resolve(root.absDir, file))),
			hiddenFromNav: true,
			...(root.slug ? { project: root.slug } : {}),
		}));
}

/**
 * Map a `docOrder` entry to a node id. Accepts a path relative to the project
 * root (`products/alpha/docs/features.md`), an already-qualified node id
 * (`alpha/features.md`), or a plain filename in single-project mode.
 */
function normalizeDocOrderEntry(entry: string, roots: DocsRoot[]): string {
	const path = entry.replace(/\\/g, "/").replace(/^\.\//, "");
	const byDir = [...roots]
		.sort((a, b) => b.dir.length - a.dir.length)
		.find((root) => root.dir && path.startsWith(`${root.dir}/`));
	return byDir ? nodeIdFor(byDir, path.slice(byDir.dir.length + 1)) : path;
}

/**
 * Combine per-root graphs into the merged manifest, applying ordering config.
 *
 * `build` is stamped in rather than computed: this function is pure over
 * already-scanned graphs and touches no filesystem, while computing the
 * inputs hash requires globbing and reading. The caller runs
 * `computeInputsHash` and passes the result in, the same way it already does
 * for contributions.
 */
export function mergeGraphs(
	config: WeftConfig,
	roots: DocsRoot[],
	graphs: Map<string, RootGraph>,
	contributions: LoadedContribution[] = [],
	build?: ManifestBuild
): Manifest {
	const scanned: WeftNode[] = [];
	const scannedEdges: WeftEdge[] = [];

	for (const root of roots) {
		const graph = graphs.get(root.slug);
		if (!graph) continue;
		scanned.push(...graph.nodes);
		scannedEdges.push(...graph.edges);
	}

	// Contributions merge before ordering, so a contributed node sorts and
	// honours docOrder exactly like an indexed one.
	const merged = applyContributions({ nodes: scanned, edges: scannedEdges }, contributions);
	let nodes: WeftNode[] = merged.nodes;
	// After contributions, so a node the build declared can be what a published
	// link resolves to.
	const edges: WeftEdge[] = resolvePublishedLinks(merged.nodes, merged.edges);

	nodes.sort((a, b) => a.id.localeCompare(b.id));

	if (config.docOrder?.length) {
		const order = config.docOrder.map((entry) => normalizeDocOrderEntry(entry, roots));

		nodes.sort((a, b) => {
			const ai = order.indexOf(a.id);
			const bi = order.indexOf(b.id);
			if (ai === -1 && bi === -1) return 0;
			if (ai === -1) return 1;
			if (bi === -1) return -1;
			return ai - bi;
		});

		// Strict mode is a nav filter, not a graph filter: dropping the unlisted
		// nodes would leave every edge touching one of them dangling, so mark
		// them instead and let the LHN skip them.
		if (config.docOrderStrict) {
			nodes = nodes.map((node) =>
				order.includes(node.id) ? node : { ...node, hiddenFromNav: true }
			);
		}
	}

	const projects = projectRefs(roots);
	const site = siteConfig(config);

	return {
		version: MANIFEST_VERSION,
		nodes,
		edges,
		...(projects.length ? { projects } : {}),
		...(site ? { site } : {}),
		...(build ? { build } : {}),
	};
}

/** Extract the presentation fields the UI consumes. Undefined when none are set. */
function siteConfig(config: WeftConfig): SiteConfig | undefined {
	const site: SiteConfig = {};
	if (config.defaultTheme) site.defaultTheme = config.defaultTheme;
	if (config.layout) site.layout = config.layout;
	if (config.siteTitle) site.siteTitle = config.siteTitle;
	if (config.siteUrl) site.siteUrl = config.siteUrl;
	if (config.ogImage) site.ogImage = config.ogImage;
	return Object.keys(site).length ? site : undefined;
}

/**
 * Partition a merged manifest into one manifest per project. An edge belongs to
 * the project of its source node, so the split and the merge are exact inverses.
 * Returns an empty array in single-project mode.
 */
export function splitManifest(manifest: Manifest, roots: DocsRoot[]): ProjectManifest[] {
	if (!isNamespaced(roots)) return [];

	const slugs = new Set(roots.map((root) => root.slug));
	const slugOf = (nodeId: string): string => {
		const first = nodeId.split("/")[0];
		return slugs.has(first) ? first : "";
	};

	return projectRefs(roots).map((project) => ({
		version: manifest.version,
		project,
		nodes: manifest.nodes.filter((node) => node.project === project.slug),
		edges: manifest.edges.filter((edge) => slugOf(edge.from.node) === project.slug),
	}));
}

/** Scan every configured docs root and build the merged graph manifest. */
export async function buildManifest(config: WeftConfig): Promise<Manifest> {
	const roots = resolveDocsRoots(config);

	// Hashed before the scan, not after: a file edited mid-scan would otherwise
	// land in the hash but not in the graph, and the manifest would be stale
	// yet report itself fresh. Hashing first inverts that race to the safe
	// side — a file edited between the hash and the scan makes the manifest
	// report stale when it is actually current, which costs an extra rebuild
	// rather than a wrong "fresh" answer. That's the whole point of freshness,
	// so the window has to fail toward stale.
	const build: ManifestBuild = {
		builtAt: new Date().toISOString(),
		inputsHash: await computeInputsHash(config),
	};

	const graphs = new Map<string, RootGraph>();
	for (const root of roots) {
		graphs.set(root.slug, await buildRootGraph(config, root, roots));
	}

	return mergeGraphs(config, roots, graphs, await loadContributions(config), build);
}
