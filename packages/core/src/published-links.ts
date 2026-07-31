import type { WeftEdge, WeftNode } from "./types.js";

/**
 * Extensions a published copy of a document typically carries.
 *
 * Deliberately a short fixed list rather than "any extension": resolving
 * `arch.png` to `arch.md` because they share a stem would invent a relationship
 * nobody wrote. A rendered sibling is a specific, recognisable convention.
 */
const PUBLISHED_EXTENSIONS = ["html", "htm", "pdf"];

/** Strip a trailing extension, or return undefined if the path has none. */
function withoutExtension(path: string): { base: string; ext: string } | undefined {
	const dot = path.lastIndexOf(".");
	const slash = path.lastIndexOf("/");
	if (dot <= slash + 1) return undefined;
	return { base: path.slice(0, dot), ext: path.slice(dot + 1).toLowerCase() };
}

/**
 * Point links at a document's published form back to the document.
 *
 * Authors link to what a reader will actually open, so a documentation set that
 * publishes is full of `guide.html` links whose only real referent is
 * `guide.md`. The target of such a link is never a node — nodes are the sources
 * — so without this every one of those references is stored as an edge to
 * nothing, and the graph is empty of the relationships it exists to hold.
 *
 * The rule is narrow on purpose: the target must not already be a node, its
 * extension must be a published-form one, and exactly one source document must
 * share its path stem. An ambiguous stem is left alone rather than guessed at.
 */
export function resolvePublishedLinks(nodes: WeftNode[], edges: WeftEdge[]): WeftEdge[] {
	const ids = new Set(nodes.map((node) => node.id));

	const byStem = new Map<string, string[]>();
	for (const node of nodes) {
		const parts = withoutExtension(node.id);
		if (!parts) continue;
		const existing = byStem.get(parts.base);
		if (existing) existing.push(node.id);
		else byStem.set(parts.base, [node.id]);
	}

	return edges.map((edge) => {
		if (ids.has(edge.to.node)) return edge;

		const parts = withoutExtension(edge.to.node);
		if (!parts || !PUBLISHED_EXTENSIONS.includes(parts.ext)) return edge;

		const candidates = byStem.get(parts.base);
		if (candidates?.length !== 1) return edge;

		return {
			...edge,
			to: { ...edge.to, node: candidates[0] },
			resolvedFrom: edge.to.node,
		};
	});
}
