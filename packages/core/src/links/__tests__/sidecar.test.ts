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

	it("carries assertions onto the edge", () => {
		const content = `
links:
  - target: spec.md
    asserts:
      version: "2.41"
      lineCount: ~3500
`;
		const [edge] = extractSidecarLinks(content, "/project/docs/a.md.weft", SINGLE);
		expect(edge.asserts).toEqual({ version: "2.41", lineCount: "~3500" });
	});

	it("omits asserts when a link makes no claim", () => {
		const content = `
links:
  - target: b.md
  - target: c.md
    asserts: {}
`;
		const edges = extractSidecarLinks(content, "/project/docs/a.md.weft", SINGLE);
		expect(edges.every((e) => !("asserts" in e))).toBe(true);
	});

	it("records a claim it cannot make sense of rather than dropping it", () => {
		// Extraction records what was written; the validation stage is where an
		// uncheckable claim gets a rule id and a configurable severity.
		const content = `
links:
  - target: b.md
    asserts:
      nonsense: yes
`;
		const [edge] = extractSidecarLinks(content, "/project/docs/a.md.weft", SINGLE);
		expect(edge.asserts).toEqual({ nonsense: "yes" });
	});

	it("ignores an asserts that is not a mapping", () => {
		const content = `
links:
  - target: b.md
    asserts: "2.41"
`;
		const [edge] = extractSidecarLinks(content, "/project/docs/a.md.weft", SINGLE);
		expect(edge.asserts).toBeUndefined();
	});

	it("carries a recorded source hash onto a derives-from edge", () => {
		const content = `
links:
  - target: guide.md
    type: derives-from
    sourceHash: abc123abc123abc1
`;
		const [edge] = extractSidecarLinks(content, "/project/docs/guide.pdf.weft", SINGLE);

		expect(edge.from.node).toBe("guide.pdf");
		expect(edge.sourceHash).toBe("abc123abc123abc1");
	});

	it("keeps a hash whose characters all happen to be digits", () => {
		// YAML reads this as the integer zero, losing every leading digit and any
		// hope of matching. Rare enough that nobody would think to look for it.
		const content = `
links:
  - target: guide.md
    type: derives-from
    sourceHash: 0000000000000000
`;
		const [edge] = extractSidecarLinks(content, "/project/docs/guide.pdf.weft", SINGLE);

		expect(edge.sourceHash).toBe("0000000000000000");
	});

	it("keeps a quoted hash unquoted", () => {
		const content = `
links:
  - target: guide.md
    type: derives-from
    sourceHash: "1234567890123456"
`;
		const [edge] = extractSidecarLinks(content, "/project/docs/guide.pdf.weft", SINGLE);

		expect(edge.sourceHash).toBe("1234567890123456");
	});

	it("reads each link's own hash when several are declared", () => {
		const content = `
links:
  - target: a.md
    type: derives-from
    sourceHash: aaaaaaaaaaaaaaa1
  - target: b.md
    type: derives-from
  - target: c.md
    type: derives-from
    sourceHash: ccccccccccccccc3
`;
		const edges = extractSidecarLinks(content, "/project/docs/guide.pdf.weft", SINGLE);

		expect(edges.map((e) => e.sourceHash)).toEqual([
			"aaaaaaaaaaaaaaa1",
			undefined,
			"ccccccccccccccc3",
		]);
	});

	it("omits sourceHash when the link records none", () => {
		const content = `
links:
  - target: guide.md
    type: derives-from
`;
		const [edge] = extractSidecarLinks(content, "/project/docs/guide.pdf.weft", SINGLE);

		expect("sourceHash" in edge).toBe(false);
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
