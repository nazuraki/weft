import { isIndexedPath } from "../../manifest.js";
import type { Anchor, WeftEdge, WeftNode } from "../../types.js";
import type { Finding, Rule, Validator } from "../types.js";

export const EDGE_TARGET_MISSING: Rule = {
	id: "edge-target-missing",
	description: "An edge points at a document that is not in the graph",
	defaultSeverity: "error",
};

export const EDGE_ANCHOR_MISSING: Rule = {
	id: "edge-anchor-missing",
	description: "An edge points at an anchor its target document does not define",
	defaultSeverity: "error",
};

export const EDGE_SOURCE_ANCHOR_MISSING: Rule = {
	id: "edge-source-anchor-missing",
	description: "An edge declares a source anchor its own document does not define",
	defaultSeverity: "error",
};

export const EDGE_PENDING: Rule = {
	id: "edge-pending",
	description: "An edge marked pending still does not resolve",
	defaultSeverity: "info",
};

export const EDGE_PENDING_RESOLVED: Rule = {
	id: "edge-pending-resolved",
	description: "An edge marked pending now resolves, so the marker can be dropped",
	defaultSeverity: "info",
};

/** Levenshtein distance, iterative with two rows. */
function distance(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;

	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
			current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
		}
		previous = current;
	}

	return previous[b.length];
}

/**
 * Find the anchor a broken one was most likely renamed from.
 *
 * A slug that vanished while a very similar one exists is a reworded heading,
 * not a deleted section — the distinction a bare slug list could never express.
 * The threshold scales with length so short slugs are not matched on noise.
 */
function closestAnchor(anchors: Anchor[], missing: string): Anchor | undefined {
	const limit = Math.max(2, Math.floor(missing.length * 0.25));
	let best: Anchor | undefined;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const anchor of anchors) {
		const d = distance(missing.toLowerCase(), anchor.slug.toLowerCase());
		if (d < bestDistance) {
			bestDistance = d;
			best = anchor;
		}
	}

	return bestDistance <= limit ? best : undefined;
}

function hasAnchor(node: WeftNode, slug: string): boolean {
	return node.anchors.some((anchor) => anchor.slug === slug);
}

/**
 * Check that every edge resolves against the graph it belongs to.
 *
 * Nothing new is extracted here — this is a set difference over the built
 * manifest. `edge.to.node` must be a node, and `edge.to.anchor` must be one of
 * that node's anchors.
 */
export const edgeResolutionValidator: Validator = {
	rules: [
		EDGE_TARGET_MISSING,
		EDGE_ANCHOR_MISSING,
		EDGE_SOURCE_ANCHOR_MISSING,
		EDGE_PENDING,
		EDGE_PENDING_RESOLVED,
	],
	// Only to explain a broken link, never to decide there is one.
	needsHistory: true,

	run({ manifest, nodes, history }) {
		const findings: Finding[] = [];

		for (const edge of manifest.edges) {
			// A declared source anchor is a claim about the document making the
			// link, so it is checked whatever happens at the other end.
			if (edge.from.anchor) {
				const source = nodes.get(edge.from.node);
				if (source && !hasAnchor(source, edge.from.anchor)) {
					const suggestion = closestAnchor(source.anchors, edge.from.anchor);
					findings.push({
						rule: EDGE_SOURCE_ANCHOR_MISSING.id,
						message: `${edge.from.node} defines no anchor ${edge.from.anchor}`,
						target: { kind: "edge", edge },
						...(suggestion
							? { hint: `Did you mean ${suggestion.slug} ("${suggestion.text}")?` }
							: {}),
						data: {
							anchor: edge.from.anchor,
							...(suggestion ? { suggestion: suggestion.slug } : {}),
						},
					});
				}
			}

			// Weft only makes nodes from documents it indexes, so a link to an
			// image or a PDF was never going to resolve to one. That is not a
			// broken reference, and reporting it would bury the real ones.
			if (!isIndexedPath(edge.to.node)) continue;

			const target = nodes.get(edge.to.node);

			if (!target) {
				if (edge.pending) {
					findings.push({
						rule: EDGE_PENDING.id,
						message: "Target document does not exist yet",
						target: { kind: "edge", edge },
					});
					continue;
				}

				// Moving a document is ordinary maintenance, and it breaks every
				// link to it. Git already knows what moved where, so say so rather
				// than leaving a pile of dangling references to be worked out by
				// hand. Only when the destination is really in the graph — a rename
				// to something since deleted explains nothing.
				const movedTo = history.renames.get(edge.to.node);
				const renamedTo = movedTo && nodes.has(movedTo) ? movedTo : undefined;

				findings.push({
					rule: EDGE_TARGET_MISSING.id,
					message: renamedTo
						? `${edge.to.node} moved to ${renamedTo}`
						: `No document ${edge.to.node} is in the graph`,
					target: { kind: "edge", edge },
					hint: renamedTo
						? `Point the link at ${renamedTo}.`
						: "Create the document, fix the path, or mark the link pending in a sidecar.",
					data: { target: edge.to.node, ...(renamedTo ? { renamedTo } : {}) },
				});
				continue;
			}

			if (edge.to.anchor && !hasAnchor(target, edge.to.anchor)) {
				if (edge.pending) {
					findings.push({
						rule: EDGE_PENDING.id,
						message: "Target anchor does not exist yet",
						target: { kind: "edge", edge },
					});
					continue;
				}

				const suggestion = closestAnchor(target.anchors, edge.to.anchor);
				findings.push({
					rule: EDGE_ANCHOR_MISSING.id,
					// Worth separating from a missing document: the target is right
					// and only the heading moved, which is a different fix.
					message: `${edge.to.node} exists but defines no anchor ${edge.to.anchor}`,
					target: { kind: "edge", edge },
					hint: suggestion
						? `Did you mean ${suggestion.slug} ("${suggestion.text}")?`
						: "No similarly named anchor exists; the section may have been removed.",
					data: {
						target: edge.to.node,
						anchor: edge.to.anchor,
						...(suggestion ? { suggestion: suggestion.slug } : {}),
					},
				});
				continue;
			}

			// Resolves, but is still carrying a pending marker — say so, or the
			// suppression outlives the reason for it.
			if (edge.pending) {
				findings.push({
					rule: EDGE_PENDING_RESOLVED.id,
					message: "Resolves now, so `pending: true` can be removed",
					target: { kind: "edge", edge },
				});
			}
		}

		return findings;
	},
};
