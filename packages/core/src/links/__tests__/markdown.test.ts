import { describe, expect, it } from "vitest";
import type { DocsRoot } from "../../config.js";
import { extractMarkdownLinks } from "../markdown.js";

const SINGLE: DocsRoot[] = [{ slug: "", dir: "docs", absDir: "/project/docs", external: false }];

const MULTI: DocsRoot[] = [
	{
		name: "Alpha",
		slug: "alpha",
		dir: "products/alpha/docs",
		absDir: "/project/products/alpha/docs",
		external: false,
	},
	{
		name: "Beta",
		slug: "beta",
		dir: "products/beta/docs",
		absDir: "/project/products/beta/docs",
		external: false,
	},
];

// A renderer's source form leaves placeholders in link paths. Recording an edge
// to the literal text would invent a node that never exists, and the
// edge-resolution check would then report correct source as broken.
describe("extractMarkdownLinks (unresolved template syntax)", () => {
	const cases: [string, string][] = [
		["Handlebars/Liquid", "{{version}}/api.md"],
		["Liquid tag", "{% raw %}/api.md"],
		["JS template", "${version}/api.md"],
		["ERB/EJS", "<%= version %>/api.md"],
		["placeholder in the filename", "api-{{lang}}.md"],
	];

	for (const [name, url] of cases) {
		it(`emits no edge for a ${name} path`, () => {
			const edges = extractMarkdownLinks(`[Link](${url})`, "/project/docs/a.md", SINGLE);
			expect(edges).toEqual([]);
		});
	}

	it("still links a path with no template syntax", () => {
		const edges = extractMarkdownLinks("[Link](api.md)", "/project/docs/a.md", SINGLE);
		expect(edges).toHaveLength(1);
	});

	it("ignores template syntax in the anchor, which does not affect the target", () => {
		const edges = extractMarkdownLinks("[Link](api.md#{{section}})", "/project/docs/a.md", SINGLE);
		expect(edges).toHaveLength(1);
		expect(edges[0].to.node).toBe("api.md");
	});
});

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

	it("emits POSIX-separated ids for nested sources and targets", () => {
		const content = "[Sibling](../schemas/order.md)\n";
		const edges = extractMarkdownLinks(content, "/project/docs/guides/setup.md", SINGLE);

		expect(edges[0].from.node).toBe("guides/setup.md");
		expect(edges[0].to.node).toBe("schemas/order.md");
		expect(edges[0].from.node).not.toMatch(/\\/);
		expect(edges[0].to.node).not.toMatch(/\\/);
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

describe("extractMarkdownLinks (GitHub blob URLs)", () => {
	const REPOS = new Map([["acme/alpha", "/checkouts/alpha"]]);
	const ROOTS: DocsRoot[] = [
		{ slug: "", dir: "docs", absDir: "/project/docs", external: false },
		{
			name: "Alpha",
			slug: "alpha",
			dir: "docs",
			absDir: "/checkouts/alpha/docs",
			repo: "acme/alpha",
			external: true,
		},
	];

	it("resolves a blob URL into a mapped repo's docs root, recording the URL", () => {
		const edges = extractMarkdownLinks(
			"[API](https://github.com/acme/alpha/blob/main/docs/api.md#endpoints)",
			"/project/docs/README.md",
			ROOTS,
			REPOS
		);

		expect(edges).toEqual([
			{
				from: { node: "README.md" },
				to: { node: "alpha/api.md", anchor: "#endpoints" },
				type: "references",
				label: "API",
				resolvedFrom: "https://github.com/acme/alpha/blob/main/docs/api.md#endpoints",
			},
		]);
	});

	it("accepts any ref segment", () => {
		const edges = extractMarkdownLinks(
			"[API](https://github.com/acme/alpha/blob/v2.1/docs/api.md)",
			"/project/docs/README.md",
			ROOTS,
			REPOS
		);
		expect(edges[0]?.to.node).toBe("alpha/api.md");
	});

	it("leaves a blob URL into an unmapped repo as an external link", () => {
		const edges = extractMarkdownLinks(
			"[Other](https://github.com/acme/other/blob/main/docs/api.md)",
			"/project/docs/README.md",
			ROOTS,
			REPOS
		);
		expect(edges).toEqual([]);
	});

	it("leaves a blob URL whose path lands outside every docs root as external", () => {
		const edges = extractMarkdownLinks(
			"[Source](https://github.com/acme/alpha/blob/main/src/main.ts)",
			"/project/docs/README.md",
			ROOTS,
			REPOS
		);
		expect(edges).toEqual([]);
	});

	it("ignores non-blob GitHub URLs and other hosts", () => {
		const content = [
			"[Tree](https://github.com/acme/alpha/tree/main/docs)",
			"[Issue](https://github.com/acme/alpha/issues/12)",
			"[GitLab](https://gitlab.com/acme/alpha/blob/main/docs/api.md)",
		].join("\n");
		expect(extractMarkdownLinks(content, "/project/docs/README.md", ROOTS, REPOS)).toEqual([]);
	});

	it("ignores every http link when no repo map is passed", () => {
		const edges = extractMarkdownLinks(
			"[API](https://github.com/acme/alpha/blob/main/docs/api.md)",
			"/project/docs/README.md",
			ROOTS
		);
		expect(edges).toEqual([]);
	});
});
