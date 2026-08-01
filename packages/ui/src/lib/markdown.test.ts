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
 * Every `<name …>` start tag as an attribute map — order- and quoting-agnostic.
 *
 * Matching attributes positionally would pin `hast-util-to-html`'s serialization
 * order, which is an implementation detail of a transitive dependency: a bump
 * that swapped two attributes would fail a test with nothing behaviourally
 * wrong.
 */
function tagsOf(html: string, name: string): Record<string, string>[] {
	return [...html.matchAll(new RegExp(`<${name}(?=[\\s/>])[^>]*>`, "g"))].map((m) =>
		Object.fromEntries(
			[...m[0].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)]
				.slice(1)
				.filter((a) => a[1])
				.map((a) => [a[1], a[2] ?? ""])
		)
	);
}

/**
 * The loop this issue exists to close: an anchor is extracted, indexed, stored,
 * transported and offered as a UI affordance, and none of that means anything
 * unless the rendered page actually carries an element with that id.
 */
async function assertAnchorsReachable(markdown: string) {
	const html = await renderMarkdown(markdown);
	const indexed = extractAnchors(markdown, "markdown").map((a) => a.slug);

	expect(renderedIds(html)).toEqual(indexed);

	// No in-page link may point at nothing — heading permalinks, footnote refs
	// and backrefs alike. Checked here rather than on a synthetic fixture so it
	// runs over every document this suite already renders, including this repo's
	// own docs. `dangling` rather than a per-href loop so a failure names the
	// broken target instead of dumping every id in the document.
	const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
	const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
	expect([...new Set(hrefs.filter((href) => !ids.has(href)))]).toEqual([]);
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

describe("renderMarkdown (footnotes)", () => {
	const DOC = "# Title\n\nText with a note[^1].\n\n[^1]: The note itself.\n";

	it("wires footnote ref, definition, backref and label to each other", async () => {
		const html = await renderMarkdown(DOC);

		const [ref] = tagsOf(html, "a").filter((t) => "data-footnote-ref" in t);
		const [back] = tagsOf(html, "a").filter((t) => "data-footnote-backref" in t);
		const defs = tagsOf(html, "li").filter((t) => t.id);
		const headings = [1, 2, 3, 4, 5, 6].flatMap((n) => tagsOf(html, `h${n}`)).filter((t) => t.id);

		expect(ref).toBeDefined();
		expect(back).toBeDefined();
		expect(defs.length).toBeGreaterThan(0);

		// Asserted as relationships, not literals. The `user-content-` prefix comes
		// from `mdast-util-to-hast`, not from anything here, and this codebase
		// argues elsewhere for dropping it — pinning the string would fail a change
		// that broke nothing. What must hold is that the two ends agree.
		expect(ref.href).toBe(`#${defs[0].id}`);
		expect(back.href).toBe(`#${ref.id}`);
		// The one literal worth keeping: `aria-describedby` names it by hand, so a
		// pass that re-slugs this heading orphans every footnote reference —
		// silently, and invisibly to every other assertion in this file.
		expect(headings.map((h) => h.id)).toContain(ref["aria-describedby"]);
	});
});

describe("renderMarkdown (sanitization)", () => {
	// The sink is innerHTML, so the failure mode needs stating precisely: a bare
	// <script> inserted that way is inert, and these are the vectors that fire.
	it("strips an inline event handler, which does execute on insertion", async () => {
		const html = await renderMarkdown('<img src=x onerror="alert(1)">\n');

		expect(html).not.toContain("onerror");
		expect(html).not.toContain("alert(1)");
	});

	it("strips an svg onload handler", async () => {
		const html = await renderMarkdown('<svg onload="alert(1)"></svg>\n');

		expect(html).not.toContain("onload");
	});

	it("removes an iframe outright", async () => {
		const html = await renderMarkdown('<iframe src="https://evil.example"></iframe>\n');

		expect(html).not.toContain("<iframe");
	});

	it("drops a javascript: href written as ordinary Markdown", async () => {
		// This one never depended on allowDangerousHtml — remark produces it from
		// plain link syntax, so turning raw HTML off would not have closed it.
		const html = await renderMarkdown("[click](javascript:alert(1))\n");

		expect(html).not.toContain("javascript:");
	});

	it("drops a javascript: href written as raw HTML", async () => {
		const html = await renderMarkdown('<a href="javascript:alert(1)">click</a>\n');

		expect(html).not.toContain("javascript:");
	});

	it("removes a script element", async () => {
		const html = await renderMarkdown("<script>alert(1)</script>\n");

		expect(html).not.toContain("<script");
	});

	it("keeps a legitimate inline svg figure", async () => {
		// Removing allowDangerousHtml would delete this silently, which is why
		// sanitizing is the fix rather than switching raw HTML off.
		const html = await renderMarkdown(
			'<svg viewBox="0 0 10 10"><rect x="0" y="0" width="5" height="5" fill="red"/></svg>\n'
		);

		expect(html).toContain("<svg");
		expect(html).toContain("<rect");
		expect(html).toContain('viewBox="0 0 10 10"');
	});

	it("keeps ordinary links and http protocols working", async () => {
		const html = await renderMarkdown("[a](https://example.com) and [b](guide.md)\n");

		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('href="guide.md"');
	});

	// The trap this schema exists to avoid: defaultSchema renames every id to
	// user-content-*, which would break every anchor the graph points at.
	it("leaves heading ids unprefixed, so graph anchors still resolve", async () => {
		const html = await renderMarkdown("## Data Flow\n");

		expect(html).toContain('id="data-flow"');
		expect(html).not.toContain("user-content");
	});
});

describe("renderMarkdown (rendering affordances)", () => {
	it("highlights a fenced block with a known language", async () => {
		const html = await renderMarkdown("```lua\nlocal x = 1\n```\n");

		// Lua is 78% of the target corpus's code blocks, and an unhighlighted
		// block looks identical to a working one — so this asserts the grammar
		// is actually present rather than merely requested.
		expect(html).toContain("hljs");
		expect(html).toContain("hljs-keyword");
	});

	it("survives sanitization with its highlight classes intact", async () => {
		const html = await renderMarkdown('```json\n{"a": 1}\n```\n');

		expect(html).toMatch(/class="[^"]*hljs-/);
	});

	it("records the language on the pre for the chip", async () => {
		const html = await renderMarkdown("```bash\necho hi\n```\n");

		expect(html).toContain('data-lang="bash"');
	});

	it("leaves a fence with no language without a chip", async () => {
		const html = await renderMarkdown("```\nplain\n```\n");

		expect(html).not.toContain("data-lang");
	});

	it("wraps a table so it can scroll on its own", async () => {
		const html = await renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |\n");

		expect(html).toContain('<div class="table-wrap">');
		expect(html.indexOf("table-wrap")).toBeLessThan(html.indexOf("<table>"));
	});

	it("gives every heading a permalink pointing at its own id", async () => {
		const html = await renderMarkdown("## Data Flow\n");

		expect(html).toContain('class="heading-anchor"');
		expect(html).toContain('href="#data-flow"');
	});
});

describe("renderMarkdown (contributed plugins)", () => {
	/** A stand-in for a host's house vocabulary — the case the seam exists for. */
	function markSeverity() {
		return (tree: import("hast").Root) => {
			const visit = (node: { children?: unknown[] } & Record<string, unknown>) => {
				for (const child of (node.children ?? []) as Record<string, unknown>[]) {
					if (child.tagName === "strong") {
						child.properties = { ...(child.properties as object), className: ["sev"] };
					}
					visit(child as { children?: unknown[] } & Record<string, unknown>);
				}
			};
			visit(tree as unknown as { children?: unknown[] } & Record<string, unknown>);
		};
	}

	it("runs a contributed rehype plugin", async () => {
		const html = await renderMarkdown("**Severity:** High\n", {
			rehypePlugins: [markSeverity],
			extendSchema: (schema) => ({
				...schema,
				attributes: {
					...schema.attributes,
					strong: [...(schema.attributes?.strong ?? []), ["className", "sev"]],
				},
			}),
		});

		expect(html).toContain('class="sev"');
	});

	it("sanitizes what a contributed plugin emits when the schema does not cover it", async () => {
		// Sanitization runs last on purpose. A plugin cannot smuggle markup past
		// the allowlist by emitting it after the document was checked.
		const html = await renderMarkdown("**Severity:** High\n", {
			rehypePlugins: [markSeverity],
		});

		expect(html).not.toContain('class="sev"');
		expect(html).toContain("<strong>");
	});

	it("lets a contributed plugin see raw HTML from the document", async () => {
		// rehype-raw is what makes this possible — while raw HTML stays opaque,
		// no plugin can inspect or transform anything inside it.
		let sawRawElement = false;
		const inspect = () => (tree: import("hast").Root) => {
			const walk = (node: { children?: unknown[]; tagName?: string }) => {
				if (node.tagName === "aside") sawRawElement = true;
				for (const child of (node.children ?? []) as { children?: unknown[] }[]) walk(child);
			};
			walk(tree as unknown as { children?: unknown[] });
		};

		await renderMarkdown("<aside>note</aside>\n", { rehypePlugins: [inspect] });

		expect(sawRawElement).toBe(true);
	});

	it("renders normally when no plugins are supplied", async () => {
		const html = await renderMarkdown("# Title\n");

		expect(html).toContain('id="title"');
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
