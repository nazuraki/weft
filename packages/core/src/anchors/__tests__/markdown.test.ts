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

/** Slugs alone, for the cases that are only about slugification. */
function slugs(content: string): string[] {
	return extractMarkdownAnchors(content).map((a) => a.slug);
}

describe("extractMarkdownAnchors", () => {
	it("extracts heading slugs", () => {
		const content = "# Title\n\n## Getting Started\n\n### API Reference\n";
		expect(slugs(content)).toEqual(["#title", "#getting-started", "#api-reference"]);
	});

	it("handles duplicate headings with suffix", () => {
		const content = "## Overview\n\n## Details\n\n## Overview\n";
		expect(slugs(content)).toEqual(["#overview", "#details", "#overview-1"]);
	});

	it("strips special characters", () => {
		expect(slugs("## What is `weft`?\n")).toEqual(["#what-is-weft"]);
	});

	it("returns empty array for no headings", () => {
		expect(extractMarkdownAnchors("Just a paragraph.\n")).toEqual([]);
	});

	it("extracts headings from CRLF content", () => {
		const content = crlf("# Title\n\n## Getting Started\n\n### API Reference\n");
		expect(slugs(content)).toEqual(["#title", "#getting-started", "#api-reference"]);
	});

	it("slugs CRLF headings identically to LF", () => {
		const content = "## What is `weft`?\n\n## Overview\n\n## Overview\n";
		expect(extractMarkdownAnchors(crlf(content))).toEqual(extractMarkdownAnchors(content));
	});

	it("carries the line, level and raw text of each heading", () => {
		const content = "# Title\n\nprose\n\n### Data Flow\n";

		expect(extractMarkdownAnchors(content)).toEqual([
			{ slug: "#title", text: "Title", line: 1, level: 1 },
			{ slug: "#data-flow", text: "Data Flow", line: 5, level: 3 },
		]);
	});

	it("numbers lines from 1, and counts CRLF lines the same as LF", () => {
		const content = "intro\n\n## Later\n";

		expect(extractMarkdownAnchors(content)[0].line).toBe(3);
		expect(extractMarkdownAnchors(crlf(content))[0].line).toBe(3);
	});

	it("keeps the raw heading text before slugification", () => {
		const anchors = extractMarkdownAnchors("## What is `weft`?\n");

		expect(anchors[0].text).toBe("What is `weft`?");
		expect(anchors[0].slug).toBe("#what-is-weft");
	});
});

// Slugs are authored against how the document renders on GitHub (DD-2), so
// github-slugger's output is the correct answer, not an approximation of it.
describe("extractMarkdownAnchors (GitHub slug parity)", () => {
	it("gives each space its own hyphen rather than collapsing runs", () => {
		expect(slugs("## Layout — Presenting Mode\n")).toEqual(["#layout--presenting-mode"]);
		expect(slugs("## React + Vite\n")).toEqual(["#react--vite"]);
		expect(slugs("## Fastify / Express\n")).toEqual(["#fastify--express"]);
	});

	it("keeps accented letters instead of stripping them", () => {
		expect(slugs("## Café Setup\n")).toEqual(["#café-setup"]);
		expect(slugs("## Naïve Approach\n")).toEqual(["#naïve-approach"]);
	});

	it("keeps non-Latin headings rather than slugging them to nothing", () => {
		expect(slugs("## 日本語の見出し\n")).toEqual(["#日本語の見出し"]);
	});

	it("does not collapse a heading of only punctuation into a colliding empty slug", () => {
		// Previously every such heading became "#", then "#-1", "#-2".
		const result = slugs("## 日本語\n\n## 中文\n");
		expect(new Set(result).size).toBe(2);
	});
});

describe("extractMarkdownAnchors (fenced code)", () => {
	it("ignores a # comment inside a fenced block", () => {
		const content = "# Usage\n\n```sh\n# Install globally\nnpm i -g weft\n```\n";
		expect(slugs(content)).toEqual(["#usage"]);
	});

	it("resumes finding headings after the fence closes", () => {
		const content = "```\n# not a heading\n```\n\n## Real Heading\n";
		expect(slugs(content)).toEqual(["#real-heading"]);
	});

	it("handles tilde fences and a longer closing marker", () => {
		const content = "~~~\n# nope\n~~~\n\n## Yes\n";
		expect(slugs(content)).toEqual(["#yes"]);
	});

	it("does not let a tilde fence close a backtick fence", () => {
		const content = "```\n~~~\n# still code\n```\n\n## After\n";
		expect(slugs(content)).toEqual(["#after"]);
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
