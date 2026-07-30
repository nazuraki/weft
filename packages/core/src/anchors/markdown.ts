import GithubSlugger from "github-slugger";
import type { Heading } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Anchor } from "../types.js";

/**
 * Split content into lines, tolerating CRLF.
 *
 * A trailing `\r` would otherwise survive into every line: `.` does not match
 * `\r` and `$` (no `m` flag) only matches at end of input, so the line patterns
 * below silently fail on any file checked out with Windows line endings.
 */
function toLines(content: string): string[] {
	return content.split(/\r?\n/);
}

/**
 * Extract heading anchors from Markdown content.
 *
 * Slugs come from `github-slugger`, the implementation GitHub's own rendering
 * uses, rather than an approximation of it: links are authored against how the
 * document renders on GitHub (DD-2), so GitHub's slugs are the correct ones.
 * The slugger also owns the `-1`, `-2` suffixes it appends to repeated slugs.
 */
export function extractMarkdownAnchors(content: string): Anchor[] {
	const tree = unified().use(remarkParse).parse(content);
	const slugger = new GithubSlugger();
	const anchors: Anchor[] = [];

	visit(tree, "heading", (node: Heading) => {
		// Slug the heading's *rendered* text, not its source line. GitHub slugs
		// what it rendered, so `## See [docs](x.md)` is `#see-docs` — slugging the
		// raw line would produce `#see-docsxmd` and the id in the page would never
		// match the anchor in the graph.
		//
		// Image alt text and raw HTML are excluded to match `hast-util-to-string`,
		// which is what the renderer's slug plugin sees.
		const text = toString(node, { includeImageAlt: false, includeHtml: false });

		anchors.push({
			slug: `#${slugger.slug(text)}`,
			text,
			line: node.position?.start.line ?? 0,
			level: node.depth,
		});
	});

	return anchors;
}

/** Extract the first prose paragraph as a plain-text description. */
export function extractMarkdownDescription(content: string): string | undefined {
	for (const line of toLines(content)) {
		const trimmed = line.trim();
		if (
			!trimmed ||
			trimmed.startsWith("#") ||
			trimmed.startsWith(">") ||
			trimmed.startsWith("-") ||
			trimmed.startsWith("|")
		)
			continue;
		const plain = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "");
		if (plain.length > 20) return plain.slice(0, 200);
	}
	return undefined;
}

/** Extract the title (first H1) from Markdown content. */
export function extractMarkdownTitle(content: string): string | undefined {
	for (const line of toLines(content)) {
		const match = line.match(/^#\s+(.+)$/);
		if (match) return match[1].trim();
	}
	return undefined;
}
