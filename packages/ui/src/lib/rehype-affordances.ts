import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

/** The language class `remark-rehype` writes onto a fenced block's `<code>`. */
const LANGUAGE_CLASS = /^language-(.+)$/;

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

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
