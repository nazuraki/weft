import { describe, expect, it } from "vitest";
import {
	extractMarkdownAnchors,
	extractMarkdownDescription,
	extractMarkdownTitle,
} from "../markdown.js";

/**
 * Build CRLF content explicitly rather than reading a fixture — a fixture's line
 * endings depend on how the repo was checked out, so it would not reliably
 * exercise this path.
 */
function crlf(content: string): string {
	return content.replace(/\n/g, "\r\n");
}

describe("extractMarkdownAnchors", () => {
	it("extracts heading slugs", () => {
		const content = "# Title\n\n## Getting Started\n\n### API Reference\n";
		expect(extractMarkdownAnchors(content)).toEqual([
			"#title",
			"#getting-started",
			"#api-reference",
		]);
	});

	it("handles duplicate headings with suffix", () => {
		const content = "## Overview\n\n## Details\n\n## Overview\n";
		expect(extractMarkdownAnchors(content)).toEqual(["#overview", "#details", "#overview-1"]);
	});

	it("strips special characters", () => {
		const content = "## What is `weft`?\n";
		expect(extractMarkdownAnchors(content)).toEqual(["#what-is-weft"]);
	});

	it("returns empty array for no headings", () => {
		expect(extractMarkdownAnchors("Just a paragraph.\n")).toEqual([]);
	});

	it("extracts headings from CRLF content", () => {
		const content = crlf("# Title\n\n## Getting Started\n\n### API Reference\n");
		expect(extractMarkdownAnchors(content)).toEqual([
			"#title",
			"#getting-started",
			"#api-reference",
		]);
	});

	it("slugs CRLF headings identically to LF", () => {
		const content = "## What is `weft`?\n\n## Overview\n\n## Overview\n";
		expect(extractMarkdownAnchors(crlf(content))).toEqual(extractMarkdownAnchors(content));
	});
});

describe("extractMarkdownTitle", () => {
	it("extracts the first H1", () => {
		expect(extractMarkdownTitle("# My Doc\n\n## Section")).toBe("My Doc");
	});

	it("returns undefined when no H1", () => {
		expect(extractMarkdownTitle("## Not a title\n")).toBeUndefined();
	});

	it("extracts the H1 from CRLF content", () => {
		expect(extractMarkdownTitle(crlf("# My Doc\n\n## Section\n"))).toBe("My Doc");
	});

	it("does not leave a trailing carriage return on the title", () => {
		expect(extractMarkdownTitle(crlf("# My Doc\n"))).not.toMatch(/\r/);
	});
});

describe("extractMarkdownDescription", () => {
	it("extracts the first prose paragraph", () => {
		const content = "# Title\n\nThis is the opening paragraph of the document.\n";
		expect(extractMarkdownDescription(content)).toBe(
			"This is the opening paragraph of the document."
		);
	});

	it("extracts the same paragraph from CRLF content", () => {
		const content = "# Title\n\nThis is the opening paragraph of the document.\n";
		expect(extractMarkdownDescription(crlf(content))).toBe(extractMarkdownDescription(content));
	});
});
