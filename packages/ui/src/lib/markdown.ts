import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { type PluggableList, unified } from "unified";
import {
	rehypeCodeLanguage,
	rehypeHeadingPermalinks,
	rehypeTableWrap,
} from "./rehype-affordances.js";

/** The sanitizer's allowlist. Shaped like `rehype-sanitize`'s `defaultSchema`. */
export type SanitizeSchema = typeof defaultSchema;

/** SVG elements a document may use to draw a figure, and nothing more. */
const SVG_TAGS = [
	"svg",
	"g",
	"defs",
	"title",
	"path",
	"rect",
	"circle",
	"line",
	"polyline",
	"polygon",
	"text",
	"tspan",
];

/** Presentational SVG attributes. Deliberately no event handlers and no `href`. */
const SVG_ATTRS = [
	"viewBox",
	"xmlns",
	"width",
	"height",
	"fill",
	"stroke",
	"strokeWidth",
	"strokeLinecap",
	"d",
	"x",
	"y",
	"x1",
	"y1",
	"x2",
	"y2",
	"cx",
	"cy",
	"r",
	"rx",
	"points",
	"transform",
	"opacity",
	"textAnchor",
	"fontSize",
	"className",
];

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}

/**
 * The allowlist rendered Markdown is filtered through.
 *
 * Built from `defaultSchema` — GitHub's own, which is close to what a docs tool
 * wants — and widened only where something here needs it. An allowlist rather
 * than a denylist, so markup nobody anticipated is dropped rather than passed.
 *
 * Two widenings are not obvious:
 *
 * `clobberPrefix` is emptied. `defaultSchema` renames every `id` to
 * `user-content-*` to prevent DOM clobbering, which would silently break every
 * anchor in the graph: `@weft/core` extracts `#data-flow`, edges point at it,
 * and search results scroll to it. Prefixed ids would make all of that resolve
 * to nothing, and GitHub parity — the reason the slugger was replaced at all —
 * would be gone. The trade is accepted knowingly: an author who can write a
 * document can already choose its heading text.
 *
 * `svg` and friends are allowed because a generated document may legitimately
 * embed a chart, and the alternative is deleting real content silently. Only
 * presentational attributes are listed, so `onload` and `href` inside an SVG do
 * not survive whatever the source contained.
 */
export function buildSchema(): SanitizeSchema {
	const schema = structuredClone(defaultSchema);
	const attributes: Record<string, unknown[]> = { ...(schema.attributes ?? {}) };

	/** Allow an attribute with any value. */
	const allow = (tag: string, ...names: string[]) => {
		attributes[tag] = unique([...(attributes[tag] ?? []), ...names]);
	};

	/**
	 * Add permitted `class` values for a tag.
	 *
	 * `defaultSchema` does not allow classes freely — it lists the exact values
	 * each tag may carry, so `a` permits only `data-footnote-backref`. Appending
	 * a bare `className` does not lift that: the listed values still win, and the
	 * class comes out empty rather than absent, which looks like a styling bug
	 * rather than a sanitizer decision. The existing entry has to be widened.
	 */
	const allowClass = (tag: string, ...values: (string | RegExp)[]) => {
		const existing = (attributes[tag] ?? []).filter((entry) => entry !== "className");
		const index = existing.findIndex((entry) => Array.isArray(entry) && entry[0] === "className");

		if (index === -1) attributes[tag] = [...existing, ["className", ...values]];
		else {
			const merged = [...(existing[index] as unknown[]), ...values];
			attributes[tag] = existing.map((entry, i) => (i === index ? merged : entry));
		}
	};

	// Syntax highlighting emits `hljs` on the block and `hljs-*` on every token.
	// Sanitizing before the highlighter, or without these, strips the colour and
	// leaves markup that looks highlighted and is not.
	allowClass("code", "hljs", /^hljs-./);
	allowClass("span", /^hljs-./);
	allow("pre", "dataLang");
	allowClass("pre", "hljs");
	// This renderer's own affordances.
	allowClass("a", "heading-anchor");
	allowClass("div", "table-wrap");

	for (const tag of SVG_TAGS) allow(tag, ...SVG_ATTRS.filter((name) => name !== "className"));
	for (const tag of SVG_TAGS) allowClass(tag, /./);

	return {
		...schema,
		// Real ids, so an anchor in the graph is an anchor on the page.
		clobberPrefix: "",
		attributes: attributes as SanitizeSchema["attributes"],
		tagNames: unique([...(schema.tagNames ?? []), ...SVG_TAGS, "figure", "figcaption"]),
	};
}

export interface RenderOptions {
	/** Extra remark plugins, applied to the Markdown tree before it becomes HTML. */
	remarkPlugins?: PluggableList;
	/**
	 * Extra rehype plugins, applied to the HTML tree.
	 *
	 * They run after raw HTML has been parsed, so they can see all of it, and
	 * before sanitizing, so what they emit is checked like everything else.
	 * Anything they add that is not in the allowlist will be removed — extend the
	 * schema through `extendSchema` in the same breath.
	 */
	rehypePlugins?: PluggableList;
	/**
	 * Widen the sanitizer's allowlist to cover what `rehypePlugins` emit.
	 *
	 * A transform rather than a partial to merge: the schema is nested arrays
	 * with per-tag semantics, and inventing merge rules for it would be a second
	 * thing to get wrong.
	 */
	extendSchema?: (schema: SanitizeSchema) => SanitizeSchema;
}

/**
 * Render a document to HTML.
 *
 * The order of this chain is the contract, not an implementation detail:
 *
 * `rehype-raw` parses raw HTML into the tree rather than leaving it as opaque
 * passthrough. That is what makes it visible to the sanitizer — and to any
 * contributed plugin, which cannot transform what it cannot see.
 *
 * Contributed plugins run next, then this renderer's own passes, and
 * sanitization runs last over everything. Sanitizing earlier would check the
 * document and then let plugin output through unexamined; sanitizing with a
 * stock allowlist would strip the classes the highlighter had just added. Both
 * failures are silent, which is why the ordering is spelled out here.
 *
 * `rehype-slug` gives every heading an `id`, which is what makes an anchor in
 * the graph reachable. It slugs with `github-slugger`, the same implementation
 * `@weft/core` uses to extract anchors, applied to the same parsed heading text.
 * The two agree because they are one algorithm over one input, not because they
 * were kept in step by hand.
 */
export async function renderMarkdown(
	markdown: string,
	options: RenderOptions = {}
): Promise<string> {
	const schema = (options.extendSchema ?? ((value: SanitizeSchema) => value))(buildSchema());

	const result = await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(options.remarkPlugins ?? [])
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(options.rehypePlugins ?? [])
		.use(rehypeSlug)
		.use(rehypeHeadingPermalinks)
		.use(rehypeHighlight, { detect: false })
		.use(rehypeCodeLanguage)
		.use(rehypeTableWrap)
		.use(rehypeSanitize, schema)
		.use(rehypeStringify)
		.process(markdown);

	return String(result);
}
