import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { glob } from "glob";
import { extractAnchors, extractTitle, getDocType } from "./anchors/index.js";
import { extractMarkdownDescription } from "./anchors/markdown.js";
import { type DocsRoot, isNamespaced, nodeIdFor, projectRefs, resolveDocsRoots } from "./config.js";
import { countLines, hashContent } from "./content.js";
import { parseFrontmatter } from "./frontmatter.js";
import { extractMarkdownLinks } from "./links/markdown.js";
import { extractSidecarLinks } from "./links/sidecar.js";
import type {
	Manifest,
	ProjectManifest,
	SiteConfig,
	WeftConfig,
	WeftEdge,
	WeftNode,
} from "./types.js";

/**
 * Manifest schema version.
 *
 * 2 — `WeftNode.anchors` holds `Anchor` objects rather than bare slug strings,
 * and slugs now match GitHub's own slugger, so some anchor values changed.
 */
export const MANIFEST_VERSION = 2;

/**
 * File extensions the indexer turns into nodes.
 *
 * Shared with validation so the two cannot drift: a check that an edge resolves
 * has to know which link targets were ever eligible to become nodes. Note this
 * is narrower than `getDocType`, which also maps `.json`.
 */
export const INDEXED_EXTENSIONS = ["md", "markdown", "yaml", "yml"] as const;

/** True when a node id names a file the indexer would have turned into a node. */
export function isIndexedPath(path: string): boolean {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return (INDEXED_EXTENSIONS as readonly string[]).includes(ext);
}

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

		nodes.push({
			id: nodeIdFor(root, relative(docsDir, absPath)),
			type: docType,
			title,
			anchors,
			// Computed here because the file is already in hand — no consumer of
			// these has to re-read the docs tree to get them.
			contentHash: hashContent(raw),
			lineCount: countLines(raw),
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

	// Extract links from sidecar files
	for (const sidecarFile of sidecarFiles) {
		const absPath = resolve(docsDir, sidecarFile);
		const content = readFileSync(absPath, "utf-8");
		edges.push(...extractSidecarLinks(content, absPath, roots));
	}

	return { nodes, edges };
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

/** Combine per-root graphs into the merged manifest, applying ordering config. */
export function mergeGraphs(
	config: WeftConfig,
	roots: DocsRoot[],
	graphs: Map<string, RootGraph>
): Manifest {
	let nodes: WeftNode[] = [];
	const edges: WeftEdge[] = [];

	for (const root of roots) {
		const graph = graphs.get(root.slug);
		if (!graph) continue;
		nodes.push(...graph.nodes);
		edges.push(...graph.edges);
	}

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
	const graphs = new Map<string, RootGraph>();

	for (const root of roots) {
		graphs.set(root.slug, await buildRootGraph(config, root, roots));
	}

	return mergeGraphs(config, roots, graphs);
}
