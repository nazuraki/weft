import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

/** The language class `remark-rehype` writes onto a fenced block's `<code>`. */
const LANGUAGE_CLASS = /^language-(.+)$/;

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * `remark-gfm` names this id by hand in every footnote reference's
 * `aria-describedby`, so re-slugging the heading orphans all of them.
 */
const FOOTNOTE_LABEL = "footnote-label";

/** The ids `mdast-util-to-hast` gives a footnote reference and its definition. */
const FOOTNOTE_ID = /^user-content-fn(ref)?-/;

/**
 * Drop structural ids a document has no business owning, and any duplicate.
 *
 * Two problems, one walk.
 *
 * A document can write `<li id="user-content-fn-1">` in raw HTML. That is the
 * same id the real footnote definition gets, and being earlier in the document
 * it wins every `#user-content-fn-1` lookup — so the footnote link lands on the
 * attacker's content. Allowing the shape in the sanitizer cannot tell the two
 * apart, because by then they are identical; what distinguishes them is where
 * they sit. A real definition is an `li` inside the generated
 * `section[data-footnotes]`, and a real reference is an `a` carrying
 * `data-footnote-ref`.
 *
 * And any id repeated in one document breaks whatever points at it — reached
 * without raw HTML at all by a heading titled "Footnote label", which slugs
 * onto the footnote section's own id. Later duplicates lose, so the first
 * legitimate holder keeps it.
 *
 * Residual, stated rather than papered over: a document that forges the whole
 * structure — `section[data-footnotes]` wrapping an `ol` wrapping the `li` —
 * still gets there first. Closing that needs provenance the tree no longer
 * carries at this point. It raises the bar from one attribute to three nested
 * elements, and the failure is a link landing in the wrong place rather than
 * anything executing.
 */
export function rehypeDropForgedIds() {
	return (tree: Root) => {
		const seen = new Set<string>();
		const footnoteSections: Element[] = [];

		visit(tree, "element", (node: Element) => {
			if (node.tagName === "section" && node.properties?.dataFootnotes !== undefined) {
				footnoteSections.push(node);
			}
		});

		const inFootnoteSection = (node: Element) =>
			footnoteSections.some((section) => {
				let found = false;
				visit(section, "element", (candidate: Element) => {
					if (candidate === node) found = true;
				});
				return found;
			});

		visit(tree, "element", (node: Element) => {
			const id = node.properties?.id;
			if (typeof id !== "string" || !id) return;

			if (FOOTNOTE_ID.test(id)) {
				const legitimate =
					(node.tagName === "a" && node.properties?.dataFootnoteRef !== undefined) ||
					(node.tagName === "li" && inFootnoteSection(node));
				if (!legitimate) {
					node.properties.id = undefined;
					return;
				}
			}

			// `footnote-label` is authentic only as the heading inside the footnote
			// section — `aria-describedby` hardcodes it. A body heading titled
			// "Footnote label" slugs onto it, and being earlier in document order
			// than the appended section it would otherwise win the dedup below and
			// leave every footnote reference pointing at the wrong element.
			if (id === FOOTNOTE_LABEL && !inFootnoteSection(node)) {
				node.properties.id = undefined;
				return;
			}

			if (seen.has(id)) node.properties.id = undefined;
			else seen.add(id);
		});
	};
}

/**
 * Discard any `id` a document put on a heading, so the slugger's is the only one
 * that survives.
 *
 * `rehype-slug` skips an element that already has an id, so without this a
 * document chooses its own — and an id on any element becomes a `window` named
 * property, whatever its tag. A slug is constrained to what `github-slugger`
 * emits from heading text; a raw attribute is not, and `pluginConfig` or
 * `a b c:d.e` are trivially reachable.
 *
 * Runs before the slugger rather than after the sanitizer, which was the other
 * way to close this: sanitizing last is a stronger property than sanitizing
 * early, and re-slugging a sanitized tree changes the text the slug is derived
 * from — a `<script>` inside a heading is dropped wholesale, so the id stops
 * matching the one `@lepid-labs/weft-core` computed from the source.
 */
export function rehypeDropHeadingIds() {
	return (tree: Root) => {
		visit(tree, "element", (node: Element) => {
			if (!HEADINGS.has(node.tagName) || !node.properties) return;
			if (node.properties.id === FOOTNOTE_LABEL) return;
			node.properties.id = undefined;
		});
	};
}

function classNames(node: Element): string[] {
	const value: unknown = node.properties?.className;
	if (Array.isArray(value)) return value.map(String);
	return typeof value === "string" ? value.split(/\s+/) : [];
}

/**
 * Record a fenced block's language on its `<pre>`, so the chip is drawn in CSS.
 *
 * The info string is already on the `code` element as `language-x`. Copying it
 * one level up is what lets `pre[data-lang]::before` render it: a stylesheet can
 * match on a class but cannot read one, so the value has to be an attribute.
 */
export function rehypeCodeLanguage() {
	return (tree: Root) => {
		visit(tree, "element", (node: Element) => {
			if (node.tagName !== "pre") return;

			const code = node.children.find(
				(child): child is Element => child.type === "element" && child.tagName === "code"
			);
			if (!code) return;

			for (const name of classNames(code)) {
				const match = LANGUAGE_CLASS.exec(name);
				if (match) {
					node.properties = { ...node.properties, dataLang: match[1] };
					return;
				}
			}
		});
	};
}

/**
 * Wrap every table so it can scroll on its own.
 *
 * A wide table in a fixed measure has to overflow something. Without a wrapper
 * that something is the page, which moves the whole document sideways rather
 * than the one element that is too wide.
 */
export function rehypeTableWrap() {
	return (tree: Root) => {
		visit(tree, "element", (node: Element, index, parent) => {
			if (node.tagName !== "table" || !parent || index === undefined) return;
			if (parent.type === "element" && parent.tagName === "div") {
				if (classNames(parent).includes("table-wrap")) return;
			}

			// The design system styles tables by class, and this pass is the one
			// place rendered markdown can be given one.
			const existing = classNames(node);
			if (!existing.includes("nb-table")) {
				node.properties = { ...node.properties, className: [...existing, "nb-table"] };
			}

			parent.children[index] = {
				type: "element",
				tagName: "div",
				properties: { className: ["table-wrap"] },
				children: [node],
			};
		});
	};
}

/**
 * Give every heading with an id a permalink control.
 *
 * The id alone makes an anchor addressable; this is what makes it discoverable,
 * so a reader can link to a section without reading the URL bar or the source.
 * Runs after `rehype-slug`, since it needs the id that gives it a target.
 */
export function rehypeHeadingPermalinks() {
	return (tree: Root) => {
		visit(tree, "element", (node: Element) => {
			if (!HEADINGS.has(node.tagName)) return;

			const id = node.properties?.id;
			if (typeof id !== "string" || !id) return;

			node.children.push({
				type: "element",
				tagName: "a",
				properties: {
					className: ["heading-anchor"],
					href: `#${id}`,
					ariaLabel: "Link to this section",
				},
				children: [{ type: "text", value: "#" }],
			});
		});
	};
}
