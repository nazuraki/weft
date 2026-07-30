import { describe, expect, it } from "vitest";
import { resolvePublishedLinks } from "./published-links.js";
import type { WeftEdge, WeftNode } from "./types.js";

function node(id: string): WeftNode {
	return { id, type: "markdown", title: id, anchors: [] };
}

function edge(to: string, anchor?: string): WeftEdge {
	return {
		from: { node: "index.md" },
		to: { node: to, ...(anchor ? { anchor } : {}) },
		type: "references",
	};
}

const DOCS = [node("index.md"), node("guide.md"), node("api.yaml")];

describe("resolvePublishedLinks", () => {
	it("points a link at a rendered sibling back to its source", () => {
		// Authors link to what a reader opens, so this is the common form in any
		// documentation set that publishes.
		const [resolved] = resolvePublishedLinks(DOCS, [edge("guide.html")]);

		expect(resolved.to.node).toBe("guide.md");
		expect(resolved.resolvedFrom).toBe("guide.html");
	});

	it("handles .htm and .pdf as well as .html", () => {
		const edges = resolvePublishedLinks(DOCS, [edge("guide.htm"), edge("guide.pdf")]);

		expect(edges.map((e) => e.to.node)).toEqual(["guide.md", "guide.md"]);
	});

	it("keeps the anchor, so a deep link survives the rewrite", () => {
		const [resolved] = resolvePublishedLinks(DOCS, [edge("guide.html", "#setup")]);

		expect(resolved.to).toEqual({ node: "guide.md", anchor: "#setup" });
	});

	it("resolves to a yaml source too", () => {
		const [resolved] = resolvePublishedLinks(DOCS, [edge("api.html")]);

		expect(resolved.to.node).toBe("api.yaml");
	});

	it("resolves inside a subdirectory", () => {
		const nodes = [node("index.md"), node("reports/q4.md")];
		const [resolved] = resolvePublishedLinks(nodes, [edge("reports/q4.html")]);

		expect(resolved.to.node).toBe("reports/q4.md");
	});

	it("leaves an edge that already names a node alone", () => {
		const original = edge("guide.md");
		const [resolved] = resolvePublishedLinks(DOCS, [original]);

		expect(resolved).toBe(original);
		expect(resolved.resolvedFrom).toBeUndefined();
	});

	it("does not touch a published link with no source sibling", () => {
		const [resolved] = resolvePublishedLinks(DOCS, [edge("external/report.html")]);

		expect(resolved.to.node).toBe("external/report.html");
		expect(resolved.resolvedFrom).toBeUndefined();
	});

	it("leaves an ambiguous stem alone rather than guessing", () => {
		const nodes = [node("index.md"), node("guide.md"), node("guide.yaml")];
		const [resolved] = resolvePublishedLinks(nodes, [edge("guide.html")]);

		expect(resolved.to.node).toBe("guide.html");
	});

	it("does not resolve extensions that are not a published form", () => {
		// Sharing a stem with a document does not make an image a reference to it.
		const nodes = [node("index.md"), node("arch.md")];
		const edges = resolvePublishedLinks(nodes, [edge("arch.png"), edge("arch.txt")]);

		expect(edges.map((e) => e.to.node)).toEqual(["arch.png", "arch.txt"]);
	});

	it("ignores a target with no extension at all", () => {
		const [resolved] = resolvePublishedLinks(DOCS, [edge("guide")]);

		expect(resolved.to.node).toBe("guide");
	});

	it("does not treat a dot in a directory name as an extension", () => {
		const nodes = [node("index.md"), node("v1.2/guide.md")];
		const [resolved] = resolvePublishedLinks(nodes, [edge("v1.2/guide.html")]);

		expect(resolved.to.node).toBe("v1.2/guide.md");
	});

	it("resolves across projects, where ids are namespaced", () => {
		const nodes = [node("alpha/index.md"), node("beta/api.md")];
		const [resolved] = resolvePublishedLinks(nodes, [edge("beta/api.html")]);

		expect(resolved.to.node).toBe("beta/api.md");
	});

	it("returns the same array shape and leaves other edges untouched", () => {
		const edges = [edge("guide.html"), edge("index.md"), edge("nothing.html")];
		const result = resolvePublishedLinks(DOCS, edges);

		expect(result).toHaveLength(3);
		expect(result.map((e) => e.to.node)).toEqual(["guide.md", "index.md", "nothing.html"]);
	});
});
