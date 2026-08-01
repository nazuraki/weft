<script lang="ts">
import { type RenderOptions, renderMarkdown } from "$lib/markdown.js";

interface Props extends RenderOptions {
	content: string;
	onnavigate: (nodeId: string, anchor?: string) => void;
}

let { content, onnavigate, remarkPlugins, rehypePlugins, extendSchema }: Props = $props();
let htmlContent = $state("");

$effect(() => {
	render(content);
});

async function render(md: string) {
	htmlContent = await renderMarkdown(md, { remarkPlugins, rehypePlugins, extendSchema });
}

// Intercept link clicks for in-app navigation
function handleClick(e: MouseEvent) {
	const target = (e.target as HTMLElement).closest("a");
	if (!target) return;

	const href = target.getAttribute("href");
	if (!href) return;

	// Skip external links
	if (href.startsWith("http://") || href.startsWith("https://")) return;

	// Skip anchor-only links, including every heading permalink (let browser handle)
	if (href.startsWith("#")) return;

	// The catch-all below used to be the only thing stopping a `javascript:`
	// href, which was an accident of link routing rather than a defence. The
	// sanitizer now drops those protocols before they reach the DOM, so this is
	// back to doing only the job it was written for: in-app navigation.

	e.preventDefault();

	const [path, anchor] = href.split("#");
	onnavigate(path, anchor ? `#${anchor}` : undefined);
}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="markdown-body" onclick={handleClick}>
	{@html htmlContent}
</div>

<style>
	.markdown-body {
		line-height: 1.6;
		word-wrap: break-word;
	}
	.markdown-body :global(h1),
	.markdown-body :global(h2),
	.markdown-body :global(h3),
	.markdown-body :global(h4) {
		font-family: var(--font-heading, var(--font-sans));
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--color-text);
	}
	.markdown-body :global(h1) {
		font-size: 1.875em;
		margin: 0 0 0.5em;
		padding-bottom: 0.3em;
		border-bottom: 1px solid var(--color-border-subtle, var(--color-border));
	}
	.markdown-body :global(h2) {
		font-size: 1.375em;
		margin: 1.5em 0 0.5em;
		padding-bottom: 0.25em;
		border-bottom: 1px solid var(--color-border-subtle, var(--color-border));
	}
	.markdown-body :global(h3) {
		font-size: 1.125em;
		margin: 1.25em 0 0.4em;
	}
	.markdown-body :global(a) {
		color: var(--color-link);
		text-decoration: none;
	}
	.markdown-body :global(a:hover) {
		text-decoration: underline;
	}
	.markdown-body :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--color-bg-secondary);
		padding: 0.2em 0.4em;
		border-radius: 3px;
	}
	.markdown-body :global(pre) {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 16px;
		overflow-x: auto;
	}
	.markdown-body :global(pre code) {
		background: none;
		padding: 0;
	}
	.markdown-body :global(ul), .markdown-body :global(ol) {
		padding-left: 2em;
	}
	.markdown-body :global(blockquote) {
		margin: 0;
		padding: 0 1em;
		color: var(--color-text-secondary);
		border-left: 3px solid var(--color-border);
	}
	/*
	 * Tables scroll inside their own wrapper rather than pushing the page
	 * sideways. `min-width` is what makes the wrapper do anything: without it
	 * the table shrinks to fit and the columns become unreadable instead.
	 */
	.markdown-body :global(.table-wrap) {
		overflow-x: auto;
		margin: 1em 0;
		border: 1px solid var(--color-border);
		border-radius: 6px;
	}
	.markdown-body :global(.table-wrap table) {
		border-collapse: collapse;
		min-width: 100%;
		margin: 0;
	}
	.markdown-body :global(table) {
		border-collapse: collapse;
		width: 100%;
		margin: 1em 0;
	}
	.markdown-body :global(th), .markdown-body :global(td) {
		border: 1px solid var(--color-border);
		padding: 6px 13px;
		white-space: nowrap;
	}
	.markdown-body :global(th) {
		background: var(--color-bg-secondary);
		font-weight: 600;
		position: sticky;
		top: 0;
	}
	.markdown-body :global(tbody tr:nth-child(even)) {
		background: var(--color-bg-secondary);
	}
	.markdown-body :global(tbody tr:hover) {
		background: var(--color-accent-subtle);
	}

	/* Anchor affordances: the id alone is addressable, this makes it usable. */
	.markdown-body :global(h1),
	.markdown-body :global(h2),
	.markdown-body :global(h3),
	.markdown-body :global(h4),
	.markdown-body :global(h5),
	.markdown-body :global(h6) {
		scroll-margin-top: 1rem;
	}
	.markdown-body :global(.heading-anchor) {
		margin-left: 0.35em;
		opacity: 0;
		color: var(--color-text-secondary);
		text-decoration: none;
		font-weight: 400;
	}
	.markdown-body :global(h1:hover .heading-anchor),
	.markdown-body :global(h2:hover .heading-anchor),
	.markdown-body :global(h3:hover .heading-anchor),
	.markdown-body :global(h4:hover .heading-anchor),
	.markdown-body :global(.heading-anchor:focus) {
		opacity: 1;
	}
	.markdown-body :global(:target) {
		background: var(--color-accent-subtle);
		border-radius: 4px;
	}

	/* Language chip, drawn from the data attribute the render pass records. */
	.markdown-body :global(pre[data-lang]) {
		position: relative;
	}
	.markdown-body :global(pre[data-lang]::before) {
		content: attr(data-lang);
		position: absolute;
		top: 0;
		right: 0;
		padding: 2px 8px;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--color-text-secondary);
		background: var(--color-bg-elevated);
		border-left: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
		border-radius: 0 6px 0 6px;
	}

	/*
	 * Syntax highlighting. highlight.js emits classes rather than inline
	 * styles, so the whole theme is these few rules over Weft's own tokens —
	 * which is what makes light and dark work without a second stylesheet.
	 */
	.markdown-body :global(.hljs-keyword),
	.markdown-body :global(.hljs-selector-tag),
	.markdown-body :global(.hljs-literal),
	.markdown-body :global(.hljs-section) {
		color: var(--code-keyword);
	}
	.markdown-body :global(.hljs-string),
	.markdown-body :global(.hljs-regexp),
	.markdown-body :global(.hljs-addition) {
		color: var(--code-string);
	}
	.markdown-body :global(.hljs-number),
	.markdown-body :global(.hljs-symbol),
	.markdown-body :global(.hljs-bullet) {
		color: var(--code-number);
	}
	.markdown-body :global(.hljs-comment),
	.markdown-body :global(.hljs-quote) {
		color: var(--code-comment);
		font-style: italic;
	}
	.markdown-body :global(.hljs-title),
	.markdown-body :global(.hljs-name),
	.markdown-body :global(.hljs-built_in) {
		color: var(--code-function);
	}
	.markdown-body :global(.hljs-attr),
	.markdown-body :global(.hljs-attribute),
	.markdown-body :global(.hljs-variable),
	.markdown-body :global(.hljs-template-variable) {
		color: var(--code-variable);
	}
	.markdown-body :global(.hljs-type),
	.markdown-body :global(.hljs-class .hljs-title),
	.markdown-body :global(.hljs-params) {
		color: var(--code-type);
	}
	.markdown-body :global(.hljs-meta),
	.markdown-body :global(.hljs-deletion) {
		color: var(--code-meta);
	}
	.markdown-body :global(.hljs-emphasis) {
		font-style: italic;
	}
	.markdown-body :global(.hljs-strong) {
		font-weight: 600;
	}
</style>
