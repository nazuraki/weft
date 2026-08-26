import { describe, expect, it } from "vitest";
import { INCLUDES, applyIncludeDefaults, extractSection } from "./includes.js";
import type { WeftEdge } from "./types.js";

const DOC = `# Guide

Intro paragraph.

## Deploys

How to deploy.

### Rollbacks

How to roll back.

## Monitoring

What to watch.
`;

describe("extractSection", () => {
	it("extracts from a heading to the next of the same level", () => {
		const section = extractSection(DOC, "#deploys");

		expect(section?.baseLevel).toBe(2);
		expect(section?.text).toContain("## Deploys");
		expect(section?.text).toContain("### Rollbacks");
		expect(section?.text).not.toContain("## Monitoring");
	});

	it("stops at a shallower heading", () => {
		const doc = "# A\n\n### Deep\n\ndeep text\n\n# B\n\nb text\n";
		const section = extractSection(doc, "#deep");

		expect(section?.text).toBe("### Deep\n\ndeep text\n");
		expect(section?.baseLevel).toBe(3);
	});

	it("runs to the end of the document for the last section", () => {
		const section = extractSection(DOC, "#monitoring");

		expect(section?.text).toBe("## Monitoring\n\nWhat to watch.\n");
	});

	it("accepts the anchor with or without its leading #", () => {
		expect(extractSection(DOC, "deploys")?.text).toBe(extractSection(DOC, "#deploys")?.text);
	});

	it("returns the whole document when no anchor is given", () => {
		const section = extractSection(DOC);

		expect(section?.text).toBe(DOC);
		expect(section?.baseLevel).toBe(1);
	});

	it("reports the shallowest heading as the whole-document base level", () => {
		const section = extractSection("### Only\n\ntext\n\n#### Deeper\n");
		expect(section?.baseLevel).toBe(3);
	});

	it("omits baseLevel for a document with no headings", () => {
		const section = extractSection("just prose\n");

		expect(section?.text).toBe("just prose\n");
		expect(section?.baseLevel).toBeUndefined();
	});

	it("returns undefined for an anchor naming no heading", () => {
		expect(extractSection(DOC, "#nope")).toBeUndefined();
	});

	it("slugs like the graph does, so an edge anchor selects the section", () => {
		const doc = "## See [docs](x.md)\n\nlinked heading\n\n## Next\n";
		// The slug comes from the rendered text, not the source line.
		expect(extractSection(doc, "#see-docs")?.text).toBe("## See [docs](x.md)\n\nlinked heading\n");
	});

	it("ignores a pseudo-heading inside a fenced code block", () => {
		const doc = "## Real\n\n```\n## Not a heading\n```\n\nafter\n\n## Next\n";
		const section = extractSection(doc, "#real");

		expect(section?.text).toContain("## Not a heading");
		expect(section?.text).toContain("after");
		expect(section?.text).not.toContain("## Next");
	});

	it("tolerates CRLF line endings", () => {
		const doc = "# A\r\n\r\n## Target\r\n\r\ntext\r\n\r\n## Next\r\n";
		const section = extractSection(doc, "#target");

		expect(section?.text).toBe("## Target\n\ntext\n");
	});
});

describe("applyIncludeDefaults", () => {
	const include = (extra: Partial<WeftEdge> = {}): WeftEdge => ({
		from: { node: "faq.md" },
		to: { node: "runbook.md" },
		type: INCLUDES,
		...extra,
	});

	it("stamps the built-in defaults onto an includes edge", () => {
		const [edge] = applyIncludeDefaults([include()]);

		expect(edge.headingShift).toBe("auto");
		expect(edge.contributes).toBe("source");
	});

	it("prefers configured defaults over built-in ones", () => {
		const [edge] = applyIncludeDefaults([include()], { headingShift: "none" });

		expect(edge.headingShift).toBe("none");
		expect(edge.contributes).toBe("source");
	});

	it("keeps a per-edge value over every default", () => {
		const [edge] = applyIncludeDefaults([include({ contributes: "inline" })], {
			contributes: "source",
		});

		expect(edge.contributes).toBe("inline");
	});

	it("leaves other edge types untouched", () => {
		const [edge] = applyIncludeDefaults([
			{ from: { node: "a.md" }, to: { node: "b.md" }, type: "references" },
		]);

		expect("headingShift" in edge).toBe(false);
		expect("contributes" in edge).toBe(false);
	});
});
