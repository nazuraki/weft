import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { glob } from "glob";
import { extractAnchors, extractTitle, getDocType } from "./anchors/index.js";
import { extractMarkdownDescription } from "./anchors/markdown.js";
import { type DocsRoot, isNamespaced, nodeIdFor, projectRefs, resolveDocsRoots } from "./config.js";
import { parseFrontmatter } from "./frontmatter.js";
import { extractMarkdownLinks } from "./links/markdown.js";
import { extractSidecarLinks } from "./links/sidecar.js";
import type { Manifest, ProjectManifest, WeftConfig, WeftEdge, WeftNode } from "./types.js";

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
	const files = await glob("**/*.{md,markdown,yaml,yml}", {
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
		if (config.docOrderStrict) {
			nodes = order
				.map((id) => nodes.find((n) => n.id === id))
				.filter((n): n is WeftNode => n !== undefined);
		} else {
			nodes.sort((a, b) => {
				const ai = order.indexOf(a.id);
				const bi = order.indexOf(b.id);
				if (ai === -1 && bi === -1) return 0;
				if (ai === -1) return 1;
				if (bi === -1) return -1;
				return ai - bi;
			});
		}
	}

	const projects = projectRefs(roots);

	return {
		version: 1,
		nodes,
		edges,
		...(projects.length ? { projects } : {}),
	};
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
