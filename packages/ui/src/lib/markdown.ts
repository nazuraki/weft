import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Render a document to HTML.
 *
 * `rehype-slug` gives every heading an `id`, which is what makes an anchor in
 * the graph reachable: edges carry `to.anchor`, search hits point at anchors,
 * and `DocView` scrolls by `getElementById` — all of which silently did nothing
 * while headings had no ids.
 *
 * It slugs with `github-slugger`, the same implementation `@weft/core` uses to
 * extract anchors, applied to the same parsed heading text. The two agree
 * because they are one algorithm over one input, not because they were kept in
 * step by hand.
 */
export async function renderMarkdown(markdown: string): Promise<string> {
	const result = await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeSlug)
		.use(rehypeStringify, { allowDangerousHtml: true })
		.process(markdown);

	return String(result);
}
