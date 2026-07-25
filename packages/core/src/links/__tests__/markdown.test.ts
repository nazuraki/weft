import { describe, expect, it } from "vitest";
import type { DocsRoot } from "../../config.js";
import { extractMarkdownLinks } from "../markdown.js";

const SINGLE: DocsRoot[] = [{ slug: "", dir: "docs", absDir: "/project/docs" }];

const MULTI: DocsRoot[] = [
	{
		name: "Alpha",
		slug: "alpha",
		dir: "products/alpha/docs",
		absDir: "/project/products/alpha/docs",
	},
	{ name: "Beta", slug: "beta", dir: "products/beta/docs", absDir: "/project/products/beta/docs" },
];

describe("extractMarkdownLinks", () => {
	it("extracts relative links within docs", () => {
		const content = "See [Architecture](architecture.md#data-flow) for details.\n";
		const edges = extractMarkdownLinks(content, "/project/docs/README.md", SINGLE);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			from: { node: "README.md" },
			to: { node: "architecture.md", anchor: "#data-flow" },
			type: "references",
			label: "Architecture",
		});
	});

	it("ignores external links", () => {
		const content = "[Google](https://google.com)\n";
		const edges = extractMarkdownLinks(content, "/project/docs/README.md", SINGLE);
		expect(edges).toHaveLength(0);
	});

	it("ignores anchor-only links", () => {
		const content = "[Jump](#section)\n";
		const edges = extractMarkdownLinks(content, "/project/docs/README.md", SINGLE);
		expect(edges).toHaveLength(0);
	});

	it("ignores links outside docs directory", () => {
		const content = "[Src](../../src/main.ts)\n";
		const edges = extractMarkdownLinks(content, "/project/docs/README.md", SINGLE);
		expect(edges).toHaveLength(0);
	});

	it("handles links without anchors", () => {
		const content = "[API](api.yaml)\n";
		const edges = extractMarkdownLinks(content, "/project/docs/README.md", SINGLE);

		expect(edges).toHaveLength(1);
		expect(edges[0].to).toEqual({ node: "api.yaml" });
	});

	it("handles subdirectory links", () => {
		const content = "[Schema](schemas/user.md)\n";
		const edges = extractMarkdownLinks(content, "/project/docs/README.md", SINGLE);

		expect(edges).toHaveLength(1);
		expect(edges[0].to.node).toBe("schemas/user.md");
	});

	it("namespaces ids by project slug", () => {
		const content = "[Features](features.md)\n";
		const edges = extractMarkdownLinks(content, "/project/products/alpha/docs/README.md", MULTI);

		expect(edges).toHaveLength(1);
		expect(edges[0].from.node).toBe("alpha/README.md");
		expect(edges[0].to.node).toBe("alpha/features.md");
	});

	it("resolves a link that crosses into another project", () => {
		const content = "[Beta API](../../beta/docs/api.yaml#listUsers)\n";
		const edges = extractMarkdownLinks(content, "/project/products/alpha/docs/features.md", MULTI);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			from: { node: "alpha/features.md" },
			to: { node: "beta/api.yaml", anchor: "#listUsers" },
			type: "references",
			label: "Beta API",
		});
	});

	it("ignores links that land outside every project", () => {
		const content = "[Src](../../../src/main.ts)\n";
		const edges = extractMarkdownLinks(content, "/project/products/alpha/docs/README.md", MULTI);
		expect(edges).toHaveLength(0);
	});

	it("ignores files outside every configured root", () => {
		const content = "[Features](features.md)\n";
		const edges = extractMarkdownLinks(content, "/elsewhere/README.md", MULTI);
		expect(edges).toHaveLength(0);
	});
});
