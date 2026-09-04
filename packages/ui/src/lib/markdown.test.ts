import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAnchors } from "@lepid-labs/weft-core";
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

	// Emptying `clobberPrefix` is what keeps graph anchors resolvable, and it is
	// also what makes every id and name a document writes reach the DOM as
	// written. Any element with an id becomes a `window` named property, so the
	// allowlist has to take that back.
	it("strips an id a document puts on an ordinary element", async () => {
		const html = await renderMarkdown(
			'<div id="location">x</div>\n\n<img id="pluginConfig" src="a.png">\n'
		);

		expect(html).not.toContain('id="location"');
		expect(html).not.toContain('id="pluginConfig"');
		expect(html).toContain("<div>");
	});

	it("strips a name, the classic clobbering vector", async () => {
		const html = await renderMarkdown('<img name="attacker" src="a.png">\n');

		expect(html).not.toContain("attacker");
		expect(html).toContain("<img");
	});

	it("replaces a heading id a document chose with the slugger's own", async () => {
		// Left alone, `<h2 id="pluginConfig">` clobbers exactly as `<img id>` does,
		// and a raw attribute reaches values the slugger never emits.
		const html = await renderMarkdown('<h2 id="pluginConfig">Data Flow</h2>\n');

		expect(html).not.toContain("pluginConfig");
		expect(html).toContain('id="data-flow"');
	});

	it("does not let a document forge a footnote id and hijack the real one", async () => {
		// The earlier version of this test probed `user-content-fnEVIL` and
		// `user-content-fnord` — neither matches the schema's pattern, so both were
		// already stripped by the global filter and the test proved nothing. The id
		// below is the *exact* one the generator emits, which is the whole attack:
		// planted earlier in the document, it wins every lookup for that fragment.
		const html = await renderMarkdown(
			'<ol><li id="user-content-fn-1">EVIL</li></ol>\n\nreal[^1]\n\n[^1]: legit\n'
		);

		const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
		expect(html).toContain("EVIL"); // positive control: the element survived
		expect(html).not.toMatch(/id="user-content-fn-1"[^>]*>EVIL/);
		expect(ids.length).toBe(new Set(ids).size);

		// And the real footnote still resolves.
		const ref = html.match(/href="#(user-content-fn-\d+)"/)?.[1];
		expect(ref).toBeDefined();
		expect(ids).toContain(ref);
	});

	it("keeps footnote-label on the real section, not a body heading that collided", async () => {
		// A heading titled "Footnote label" slugs onto the id the footnote section
		// already owns. No duplicate is not enough — the id must land on the
		// element `aria-describedby` names, which is the `<h2>` inside the footnote
		// section, not the body heading that came first in document order.
		const html = await renderMarkdown("## Footnote label\n\nnote[^1]\n\n[^1]: x\n");
		const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
		expect(ids.length).toBe(new Set(ids).size); // no duplicate

		const label = tagsOf(html, "h2").find((t) => t.id === "footnote-label");
		expect(label).toBeDefined(); // it's the section's h2 (h2, not the body's h2? both are h2 — check class)
		expect(label?.class).toContain("sr-only"); // the generated label carries sr-only; the body heading does not
	});

	it("strips a browser-shortcut binding and a focus-order override", async () => {
		const html = await renderMarkdown('<p accesskey="k" tabindex="5" title="t">x</p>\n');

		expect(html).not.toContain("accesskey");
		expect(html).not.toContain("tabindex");
		expect(html).toContain('title="t"');
	});

	it("keeps svg elements inside svg, so a document cannot rename the host's tab", async () => {
		// `document.title` is the first `title` element in tree order, so a bare
		// `<title>` in a document would retitle the page it is embedded in.
		const html = await renderMarkdown(
			"<title>tab title</title>\n\n<path d='M0 0'>p</path>\n\n<circle r='5'>c</circle>\n"
		);

		expect(html).not.toContain("<title");
		expect(html).not.toContain("<path");
		expect(html).not.toContain("<circle");
		expect(html).toContain("tab title"); // unwrapped, not deleted
	});

	it("still allows them where they belong", async () => {
		const html = await renderMarkdown(
			'<svg viewBox="0 0 10 10"><title>chart</title><path d="M0 0"/></svg>\n'
		);

		expect(html).toContain("<title>chart</title>");
		expect(html).toContain("<path");
	});

	it("refuses a schema that would disable the allowlist", async () => {
		// `{...schema, tagNames: undefined}` overrides the default AND passes
		// hast-util-sanitize's falsy check, allowing every tag — a live <script>.
		await expect(
			renderMarkdown("<script>alert(1)</script>\n", {
				extendSchema: (s) => ({ ...s, tagNames: undefined }) as never,
			})
		).rejects.toThrow(/tagNames/);

		await expect(renderMarkdown("# x\n", { extendSchema: () => null as never })).rejects.toThrow(
			/sanitize schema/
		);
	});

	it("strips accesskey, which binds a browser shortcut", async () => {
		const html = await renderMarkdown('<p accesskey="k" title="t">x</p>\n');

		expect(html).not.toContain("accesskey");
		expect(html).toContain('title="t"');
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

	/**
	 * A plugin whose *attacher* registers another plugin.
	 *
	 * `unified` resolves attachers at freeze time, not at `.use()` time, so this
	 * appends a transformer to the END of its processor's list. In a single
	 * processor that lands past `rehypeSanitize` — the case above uses an
	 * ordinary transformer and never exercised this shape, which is how a
	 * documented "sanitize last" survived review while being false.
	 */
	function selfRegistering() {
		return function (this: { use: (plugin: unknown) => void }) {
			this.use(() => (tree: import("hast").Root) => {
				tree.children.push({
					type: "element",
					tagName: "img",
					properties: { src: "x", onError: "alert(1)" },
					children: [],
				});
			});
			return () => {};
		};
	}

	for (const seam of ["rehypePlugins", "remarkPlugins"] as const) {
		it(`cannot be bypassed by a self-registering plugin via ${seam}`, async () => {
			const html = await renderMarkdown("# T\n", { [seam]: [selfRegistering()] });

			// Positive control first. Without it this passes when the plugin never
			// ran at all, and passes when the property name is misspelled — an
			// unknown hast property serializes verbatim through a bypass, so
			// `not.toContain("onerror")` would go green with a live handler.
			expect(html).toContain('<img src="x">');
			expect(html).not.toContain("onerror");
			expect(html).not.toMatch(/\bon\w+=/i);
		});
	}

	it("gives a contributed plugin the source text", async () => {
		// Splitting the processor in two lost this silently: `parse()` builds a
		// VFile internally and discards it, and `run()` without one makes a fresh
		// empty file, so anything reading the source saw undefined and no error.
		let seen: unknown;
		const readsSource = () => (_tree: import("hast").Root, file: { value?: unknown }) => {
			seen = file.value;
		};

		await renderMarkdown("# Doc\n", { rehypePlugins: [readsSource] });
		expect(seen).toBe("# Doc\n");
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
