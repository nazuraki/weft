import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAnchors } from "@weft/core";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown.js";

/** Every `id` attribute in the rendered HTML, in document order. */
function renderedIds(html: string): string[] {
	return [...html.matchAll(/<h[1-6][^>]*\bid="([^"]*)"/g)].map((m) => `#${m[1]}`);
}

/**
 * The loop this issue exists to close: an anchor is extracted, indexed, stored,
 * transported and offered as a UI affordance, and none of that means anything
 * unless the rendered page actually carries an element with that id.
 */
async function assertAnchorsReachable(markdown: string) {
	const indexed = extractAnchors(markdown, "markdown").map((a) => a.slug);
	const inPage = renderedIds(await renderMarkdown(markdown));

	expect(inPage).toEqual(indexed);
}

describe("renderMarkdown", () => {
	it("gives every heading an id", async () => {
		const html = await renderMarkdown("# Title\n\n## Data Flow\n");

		expect(html).toContain('id="title"');
		expect(html).toContain('id="data-flow"');
	});

	it("still renders content and links", async () => {
		const html = await renderMarkdown("# T\n\nSee [other](other.md).\n");

		expect(html).toContain('href="other.md"');
		expect(html).toContain("See");
	});

	it("keeps GFM support", async () => {
		const html = await renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |\n");
		expect(html).toContain("<table>");
	});
});

describe("rendered ids match the indexed anchors", () => {
	it("matches for plain headings", async () => {
		await assertAnchorsReachable("# Title\n\n## Getting Started\n\n### API Reference\n");
	});

	it("matches for repeated headings, so collision suffixes agree", async () => {
		await assertAnchorsReachable("## Overview\n\n## Details\n\n## Overview\n\n## Overview\n");
	});

	it("matches for punctuation between words", async () => {
		await assertAnchorsReachable("## Layout — Presenting Mode\n\n## React + Vite\n");
	});

	it("matches for accented and non-Latin headings", async () => {
		await assertAnchorsReachable("## Café Setup\n\n## 日本語の見出し\n");
	});

	it("matches for inline code and emphasis", async () => {
		await assertAnchorsReachable("## What is `weft`?\n\n## A call *(deferred — needs X)*\n");
	});

	// The case that proves the two are one algorithm rather than two that agree:
	// slugging the raw source line gives "#see-docsxmd", slugging the rendered
	// text gives "#see-docs", and only the second matches the page.
	it("matches for a heading containing a link", async () => {
		await assertAnchorsReachable("## See [the docs](guide.md) first\n");
	});

	it("matches for setext headings", async () => {
		await assertAnchorsReachable("Setext Title\n============\n\nBody.\n");
	});

	it("matches for strikethrough, which only GFM parses", async () => {
		await assertAnchorsReachable("## ~~Deprecated~~ Approach\n");
	});

	it("agrees that a heading inside a fenced block is not a heading", async () => {
		await assertAnchorsReachable("# Usage\n\n```sh\n# Install globally\nnpm i -g weft\n```\n");
	});
});

describe("rendered ids match the indexed anchors (this repo's own docs)", () => {
	const DOCS = resolve(fileURLToPath(import.meta.url), "../../../../../docs");

	for (const file of ["usage.md", "configuration.md", "implementation.md", "use-cases.md"]) {
		it(`matches for ${file}`, async () => {
			await assertAnchorsReachable(readFileSync(resolve(DOCS, file), "utf-8"));
		});
	}
});
