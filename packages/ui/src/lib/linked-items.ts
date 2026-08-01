import type { Manifest, WeftEdge } from "@weft/core";

/** One row in the linked-items sidebar. */
export interface LinkedItem {
	edge: WeftEdge;
	/** Node id this row would navigate to. */
	target: string;
	anchor?: string;
	/** What to show: the target's title, or the raw id when there is no such node. */
	label: string;
	/**
	 * False when no node has this id. The manifest may legitimately hold edges
	 * the UI cannot follow — a link to something not written yet, or a target a
	 * renderer resolves — so this is a permanent condition to present, not a bug
	 * to fix upstream.
	 */
	resolved: boolean;
	/**
	 * True when the row names a generated output rather than a document. It is a
	 * real node, so it is not struck through the way a dead edge is — but there is
	 * nothing to open, so the caller must not offer it as navigation.
	 */
	artifact: boolean;
	/** The link path as written, when it differed from the node it resolved to. */
	resolvedFrom?: string;
}

function toItem(
	edge: WeftEdge,
	manifest: Manifest,
	direction: "outgoing" | "incoming"
): LinkedItem {
	const ref = direction === "outgoing" ? edge.to : edge.from;
	const node = manifest.nodes.find((n) => n.id === ref.node);

	return {
		edge,
		target: ref.node,
		...(ref.anchor ? { anchor: ref.anchor } : {}),
		// Falling back to the raw id is what made a dead edge indistinguishable
		// from a working one; the caller must use `resolved` to tell them apart.
		label: node?.title ?? ref.node,
		resolved: node !== undefined,
		artifact: node?.type === "artifact",
		...(direction === "outgoing" && edge.resolvedFrom ? { resolvedFrom: edge.resolvedFrom } : {}),
	};
}

/** Split the edges touching a node into what the sidebar renders. */
export function linkedItems(
	manifest: Manifest,
	nodeId: string
): { outgoing: LinkedItem[]; incoming: LinkedItem[] } {
	return {
		outgoing: manifest.edges
			.filter((e) => e.from.node === nodeId)
			.map((e) => toItem(e, manifest, "outgoing")),
		incoming: manifest.edges
			.filter((e) => e.to.node === nodeId)
			.map((e) => toItem(e, manifest, "incoming")),
	};
}
