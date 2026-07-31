import type { Manifest, WeftEdge, WeftNode } from "@weft/core";
import { describe, expect, it } from "vitest";
import { linkedItems } from "./linked-items.js";

function node(id: string, title: string): WeftNode {
	return { id, type: "markdown", title, anchors: [] };
}

function manifest(edges: WeftEdge[]): Manifest {
	return {
		version: 2,
		nodes: [node("index.md", "Index"), node("guide.md", "The Guide")],
		edges,
	};
}

const toGuide: WeftEdge = {
	from: { node: "index.md" },
	to: { node: "guide.md", anchor: "#setup" },
	type: "references",
	label: "Setup steps",
};

const toNowhere: WeftEdge = {
	from: { node: "index.md" },
	to: { node: "reports/q4.html" },
	type: "references",
};

describe("linkedItems", () => {
	it("splits edges by direction", () => {
		const items = linkedItems(manifest([toGuide]), "index.md");

		expect(items.outgoing).toHaveLength(1);
		expect(items.incoming).toHaveLength(0);
		expect(linkedItems(manifest([toGuide]), "guide.md").incoming).toHaveLength(1);
	});

	it("labels a resolving edge with the target's title", () => {
		const [item] = linkedItems(manifest([toGuide]), "index.md").outgoing;

		expect(item).toMatchObject({
			target: "guide.md",
			anchor: "#setup",
			label: "The Guide",
			resolved: true,
		});
	});

	it("uses the source's title for an incoming edge", () => {
		const [item] = linkedItems(manifest([toGuide]), "guide.md").incoming;

		expect(item).toMatchObject({ target: "index.md", label: "Index", resolved: true });
	});

	// The defect: nodeTitle() fell back to the raw id, so a dead edge rendered as
	// an ordinary entry and clicking it navigated to a node that does not exist.
	it("marks an edge whose target is not a node as unresolved", () => {
		const [item] = linkedItems(manifest([toNowhere]), "index.md").outgoing;

		expect(item.resolved).toBe(false);
		expect(item.target).toBe("reports/q4.html");
	});

	it("still shows the raw target for an unresolved edge, rather than dropping it", () => {
		// A broken reference is signal; hiding it would leave `weft analyze` the
		// only way to find something the sidebar is looking straight at.
		const [item] = linkedItems(manifest([toNowhere]), "index.md").outgoing;

		expect(item.label).toBe("reports/q4.html");
	});

	it("distinguishes resolved from unresolved in one list", () => {
		const items = linkedItems(manifest([toGuide, toNowhere]), "index.md").outgoing;

		expect(items.map((i) => i.resolved)).toEqual([true, false]);
	});

	it("carries the original path when a published link was rewritten", () => {
		const rewritten: WeftEdge = {
			from: { node: "index.md" },
			to: { node: "guide.md" },
			type: "references",
			resolvedFrom: "guide.html",
		};

		const [item] = linkedItems(manifest([rewritten]), "index.md").outgoing;

		expect(item).toMatchObject({ resolved: true, resolvedFrom: "guide.html" });
	});

	it("keeps the edge itself, so the caller can show its label", () => {
		const [item] = linkedItems(manifest([toGuide]), "index.md").outgoing;

		expect(item.edge.label).toBe("Setup steps");
	});
});
