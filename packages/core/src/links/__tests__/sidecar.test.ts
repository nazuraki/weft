import { describe, expect, it } from "vitest";
import type { DocsRoot } from "../../config.js";
import { extractSidecarLinks } from "../sidecar.js";

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

describe("extractSidecarLinks", () => {
	it("extracts links from sidecar YAML", () => {
		const content = `
links:
  - anchor: "#data-flow"
    target: api.yaml#/paths/users/get
    type: references
    label: User API
`;
		const edges = extractSidecarLinks(content, "/project/docs/architecture.md.weft", SINGLE);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			from: { node: "architecture.md", anchor: "#data-flow" },
			to: { node: "api.yaml", anchor: "#/paths/users/get" },
			type: "references",
			label: "User API",
		});
	});

	it("returns empty for no links", () => {
		expect(extractSidecarLinks("", "/project/docs/a.md.weft", SINGLE)).toEqual([]);
	});

	it("carries a pending marker onto the edge", () => {
		const content = `
links:
  - target: appendix.md#glossary
    pending: true
`;
		const [edge] = extractSidecarLinks(content, "/project/docs/a.md.weft", SINGLE);
		expect(edge.pending).toBe(true);
	});

	it("omits pending when unset or false, rather than writing it as false", () => {
		const content = `
links:
  - target: b.md
  - target: c.md
    pending: false
`;
		const edges = extractSidecarLinks(content, "/project/docs/a.md.weft", SINGLE);
		expect(edges.every((e) => !("pending" in e))).toBe(true);
	});

	it("defaults type to references", () => {
		const content = `
links:
  - target: other.md
`;
		const edges = extractSidecarLinks(content, "/project/docs/a.md.weft", SINGLE);
		expect(edges[0].type).toBe("references");
	});

	it("emits a POSIX-separated id for a nested source", () => {
		const content = `
links:
  - target: other.md
`;
		const edges = extractSidecarLinks(content, "/project/docs/guides/setup.md.weft", SINGLE);

		expect(edges[0].from.node).toBe("guides/setup.md");
		expect(edges[0].from.node).not.toMatch(/\\/);
	});

	it("resolves a bare target within the source project", () => {
		const content = `
links:
  - target: features.md
`;
		const edges = extractSidecarLinks(
			content,
			"/project/products/alpha/docs/README.md.weft",
			MULTI
		);

		expect(edges[0].from.node).toBe("alpha/README.md");
		expect(edges[0].to.node).toBe("alpha/features.md");
	});

	it("uses a slug-qualified target as-is", () => {
		const content = `
links:
  - target: beta/api.yaml#listUsers
    type: implements
`;
		const edges = extractSidecarLinks(
			content,
			"/project/products/alpha/docs/features.md.weft",
			MULTI
		);

		expect(edges[0]).toEqual({
			from: { node: "alpha/features.md" },
			to: { node: "beta/api.yaml", anchor: "#listUsers" },
			type: "implements",
			label: undefined,
		});
	});

	it("returns empty for a sidecar outside every configured root", () => {
		const content = `
links:
  - target: other.md
`;
		expect(extractSidecarLinks(content, "/elsewhere/a.md.weft", MULTI)).toEqual([]);
	});
});
