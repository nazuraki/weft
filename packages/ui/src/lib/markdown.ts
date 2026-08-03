import type { Root } from "hast";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { type PluggableList, unified } from "unified";
import { VFile } from "vfile";
import {
	rehypeCodeLanguage,
	rehypeDropForgedIds,
	rehypeDropHeadingIds,
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

/**
 * Presentational SVG attributes. Deliberately no event handlers, no `href`, and
 * no `className` — nothing styles a generated SVG's classes, and allowing them
 * freely was inconsistent with the per-value gating everywhere else.
 */
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

	/** Allow an attribute — bare for any value, or `[name, ...allowed]` to restrict it. */
	const allow = (tag: string, ...names: (string | (string | RegExp)[])[]) => {
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

	// These are allowed on every element by `defaultSchema`, and with no clobber
	// prefix they reach the DOM as written. Any element with an `id` becomes a
	// `window` named property; `<img name="x">` is the classic clobbering vector;
	// `accessKey` binds a browser shortcut; and a positive `tabIndex` reorders
	// focus across the whole host page in an embed. None is anything a rendered
	// document legitimately needs, so all four come off the global list and back
	// on only where something requires them.
	const GLOBAL_STRIPPED = new Set(["id", "name", "accessKey", "tabIndex"]);
	attributes["*"] = (attributes["*"] ?? []).filter((name) => !GLOBAL_STRIPPED.has(name as string));
	// Headings: the slugger's output, and only the slugger's — a document's own
	// heading id is stripped upstream by `rehypeDropHeadingIds`.
	for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) allow(tag, "id");
	// Footnotes: `mdast-util-to-hast` emits these and the hrefs that match them.
	// Anchored at both ends — an unanchored prefix leaves the whole tail to the
	// document, including the emitter's own suffix. The shape alone cannot tell a
	// real definition from a forged one, though, because they are identical by
	// the time the sanitizer sees them; `rehypeDropForgedIds` is what separates
	// them, and this is the narrower net behind it.
	allow("a", ["id", /^user-content-fnref-\d+$/]);
	allow("li", ["id", /^user-content-fn-\d+$/]);

	for (const tag of SVG_TAGS) allow(tag, ...SVG_ATTRS);

	// Allowed inside `<svg>` and nowhere else. `tagNames` is a flat list, so
	// without this every one of them is valid anywhere — and `<title>` is the one
	// with teeth: `document.title` is the first `title` element in tree order, so
	// an embedded document could rename the host's browser tab.
	const ancestors: Record<string, string[]> = { ...(schema.ancestors ?? {}) };
	for (const tag of SVG_TAGS) {
		if (tag !== "svg") ancestors[tag] = unique([...(ancestors[tag] ?? []), "svg"]);
	}

	return {
		...schema,
		// Real ids, so an anchor in the graph is an anchor on the page.
		clobberPrefix: "",
		attributes: attributes as SanitizeSchema["attributes"],
		ancestors: ancestors as SanitizeSchema["ancestors"],
		tagNames: unique([...(schema.tagNames ?? []), ...SVG_TAGS, "figure", "figcaption"]),
	};
}

/**
 * Refuse a schema that would disable the allowlist.
 *
 * `hast-util-sanitize` spreads the given schema over its default and then tests
 * `!schema.tagNames || schema.tagNames.includes(name)` — so an own key set to
 * `undefined` both overrides the default *and* passes the falsy check, allowing
 * every tag. A host returning `{ ...schema, tagNames: undefined }` gets a live
 * `<script>` in the output, and the documented `extendSchema: (schema) => ({…})`
 * shape is exactly the object literal that drops the argument.
 *
 * The one value a host hands the sanitizer was the only unchecked input to it,
 * which rather undercut the point of running the sanitizer last.
 */
function validateSchema(schema: unknown): SanitizeSchema {
	const candidate = schema as SanitizeSchema | null | undefined;
	if (!candidate || typeof candidate !== "object") {
		throw new TypeError(`weft: extendSchema must return a sanitize schema, got ${typeof schema}`);
	}
	if (!Array.isArray(candidate.tagNames)) {
		throw new TypeError(
			"weft: extendSchema returned a schema with no `tagNames` array — that disables the allowlist entirely. Extend the schema you were given rather than replacing it."
		);
	}
	if (!candidate.attributes || typeof candidate.attributes !== "object") {
		throw new TypeError(
			"weft: extendSchema returned a schema with no `attributes` — that strips every attribute, including href."
		);
	}
	return candidate;
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
 * The order of this chain is the contract, not an implementation detail, and it
 * is enforced by *two processors* rather than by the order of `.use()` calls.
 *
 * `rehype-raw` parses raw HTML into the tree rather than leaving it as opaque
 * passthrough. That is what makes it visible to the sanitizer — and to any
 * contributed plugin, which cannot transform what it cannot see.
 *
 * Contributed plugins run in stage 1; this renderer's own passes and the
 * sanitizer run in stage 2. Sanitizing earlier would check the document and then
 * let plugin output through unexamined; sanitizing with a stock allowlist would
 * strip the classes the highlighter had just added. Both failures are silent.
 *
 * A single processor could not express this. `unified` freezes its attacher list
 * before running, so a plugin whose attacher calls `this.use()` appends past
 * everything registered after it — a documented "sanitize last" that a
 * self-registering plugin walks straight through, on either seam.
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
	const schema = validateSchema(
		(options.extendSchema ?? ((value: SanitizeSchema) => value))(buildSchema())
	);

	// Stage 1 — everything a host can reach. Its output is untrusted.
	const contributed = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(options.remarkPlugins ?? [])
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(options.rehypePlugins ?? []);

	// The VFile is threaded through explicitly. `parse()` builds one internally
	// and discards it, and `run()` without one constructs a fresh empty file — so
	// splitting the processor silently left `file.value` undefined for every
	// contributed plugin, and anything reading the source text (position
	// reporting, lint-style checks, include resolution) saw nothing with no error.
	const file = new VFile(markdown);
	const tree = (await contributed.run(contributed.parse(file) as never, file)) as Root;

	// Stage 2 — first-party, and a *separate processor* on purpose.
	//
	// `unified` resolves attachers at freeze time, not at `.use()` time. So a
	// contributed plugin whose attacher calls `this.use()` appends a transformer
	// to the END of its own processor's list — past every pass below, including
	// the sanitizer, if these shared one processor. They do not. A plugin can
	// only ever append to the stage it was given.
	const trusted = unified()
		.use(rehypeDropHeadingIds)
		.use(rehypeSlug)
		// After the slugger, so a heading that slugs onto an id the generator
		// already used is caught as the duplicate it is.
		.use(rehypeDropForgedIds)
		.use(rehypeHeadingPermalinks)
		.use(rehypeHighlight, { detect: false })
		.use(rehypeCodeLanguage)
		.use(rehypeTableWrap)
		.use(rehypeSanitize, schema)
		.use(rehypeStringify);

	return trusted.stringify((await trusted.run(tree)) as Root);
}
