import { dirname, relative, resolve } from "node:path";
import type { Link } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { type DocsRoot, nodeIdFor, rootForPath } from "../config.js";
import type { LinkRef, WeftEdge } from "../types.js";

interface MdLink {
	label: string;
	url: string;
}

/**
 * Extract graph edges from Markdown content.
 * A link is a graph edge if it targets a file within any configured docs root —
 * a link that leaves its own root but lands in another project's root becomes a
 * cross-project edge rather than being dropped.
 */
export function extractMarkdownLinks(
	content: string,
	filePath: string,
	roots: DocsRoot[]
): WeftEdge[] {
	const tree = unified().use(remarkParse).parse(content);
	const links: MdLink[] = [];

	visit(tree, "link", (node: Link) => {
		// Skip external links and anchors-only
		if (
			node.url.startsWith("http://") ||
			node.url.startsWith("https://") ||
			node.url.startsWith("#")
		) {
			return;
		}
		const label = node.children
			.map((c) => ("value" in c ? (c.value as string) : ""))
			.join("")
			.trim();
		links.push({ label, url: node.url });
	});

	const fileDir = dirname(filePath);
	const edges: WeftEdge[] = [];

	const sourceRoot = rootForPath(roots, filePath);
	if (!sourceRoot) return edges;
	const fromNode = nodeIdFor(sourceRoot, relative(sourceRoot.absDir, filePath));

	for (const link of links) {
		const [pathPart, anchor] = link.url.split("#");
		if (!pathPart) continue;

		const absTarget = resolve(fileDir, pathPart);
		const targetRoot = rootForPath(roots, absTarget);

		// Only treat as graph edge if the target lands inside a configured docs root
		if (!targetRoot) continue;

		const from: LinkRef = { node: fromNode };
		const to: LinkRef = { node: nodeIdFor(targetRoot, relative(targetRoot.absDir, absTarget)) };
		if (anchor) to.anchor = `#${anchor}`;

		edges.push({
			from,
			to,
			type: "references",
			label: link.label || undefined,
		});
	}

	return edges;
}
