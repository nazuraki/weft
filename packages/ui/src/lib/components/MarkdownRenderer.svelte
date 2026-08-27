<script lang="ts">
import { type RenderOptions, renderMarkdown } from "$lib/markdown.js";

interface Props extends RenderOptions {
	content: string;
	onnavigate: (nodeId: string, anchor?: string) => void;
	/**
	 * Fires once the rendered HTML is in the DOM.
	 *
	 * Rendering is async, so "the document finished loading" and "the document is
	 * on the page" are different moments — anything that needs to find an element
	 * by id has to wait for the second one.
	 */
	onrendered?: () => void;
}

let {
	content,
	onnavigate,
	onrendered,
	remarkPlugins,
	rehypePlugins,
	extendSchema,
	includes,
}: Props = $props();
let htmlContent = $state("");
let renderError = $state("");

$effect(() => {
	render(content);
});

async function render(md: string) {
	try {
		htmlContent = await renderMarkdown(md, {
			remarkPlugins,
			rehypePlugins,
			extendSchema,
			includes,
		});
		renderError = "";
	} catch (e) {
		// A throwing plugin or a rejected schema would otherwise leave the previous
		// document on screen and report only to the console.
		renderError = e instanceof Error ? e.message : "Failed to render document";
		htmlContent = "";
		return;
	}
	// After the DOM has the new HTML, not merely after the promise resolves.
	requestAnimationFrame(() => onrendered?.());
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
	{#if renderError}
		<p class="render-error">{renderError}</p>
	{:else}
		{@html htmlContent}
	{/if}
</div>

<style>
	.markdown-body {
		line-height: 1.6;
		word-wrap: break-word;
	}
	.render-error {
		color: var(--nb-danger, #b3261e);
	}
	/* h5 and h6 were omitted here too, so they rendered in the body font. */
	.markdown-body :global(:is(h1, h2, h3, h4, h5, h6)) {
		font-family: var(--w-font-heading, var(--w-font-sans));
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--w-text);
	}
	.markdown-body :global(h1) {
		font-size: 1.875em;
		margin: 0 0 0.5em;
		padding-bottom: 0.3em;
		border-bottom: 1px solid var(--w-border-subtle, var(--w-border));
	}
	.markdown-body :global(h2) {
		font-size: 1.375em;
		margin: 1.5em 0 0.5em;
		padding-bottom: 0.25em;
		border-bottom: 1px solid var(--w-border-subtle, var(--w-border));
	}
	.markdown-body :global(h3) {
		font-size: 1.125em;
		margin: 1.25em 0 0.4em;
	}
	.markdown-body :global(a) {
		color: var(--w-link);
		text-decoration: none;
	}
	.markdown-body :global(a:hover) {
		/* `--weft-color-link-hover` is published in the theming contract, and was
		   declared here but read nowhere — a host setting it got silence. */
		color: var(--w-link-hover);
		text-decoration: underline;
	}
	.markdown-body :global(code) {
		font-family: var(--w-font-mono);
		font-size: 0.85em;
		background: var(--w-bg-secondary);
		padding: 0.2em 0.4em;
		border-radius: 3px;
	}
	.markdown-body :global(pre) {
		background: var(--w-bg-secondary);
		border: 1px solid var(--w-border);
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
		color: var(--w-text-secondary);
		border-left: 3px solid var(--w-border);
	}
	/*
	 * Tables scroll inside their own wrapper rather than pushing the page
	 * sideways. `min-width: 100%` makes a narrow table still fill the measure;
	 * what makes the wrapper scroll is a table whose min-content width exceeds
	 * it, which is a function of its columns rather than anything set here.
	 *
	 * No sticky header. `overflow-x: auto` makes this wrapper a scroll container
	 * on both axes, so a `position: sticky` cell sticks to the wrapper — which
	 * has no height constraint and therefore never scrolls vertically. Making it
	 * work would mean a `max-height` region, which breaks Ctrl-F, printing and
	 * mobile scroll chaining; no comparable docs renderer does it either.
	 */
	/* Visual table styling (borders, header rule, row hover) is the design
	 * system's — rehype-affordances puts `nb-table` on every rendered table.
	 * What stays here is layout the wrapper contract needs. */
	.markdown-body :global(.table-wrap) {
		overflow-x: auto;
		margin: 1em 0;
	}
	.markdown-body :global(.table-wrap table) {
		min-width: 100%;
		margin: 0;
	}
	.markdown-body :global(th) {
		/* Headers only. On `td` this turns a prose column — the description
		   columns in this repo's own docs — into one unwrappable line, trading
		   vertical wrap for forced horizontal scrolling. */
		white-space: nowrap;
	}

	/*
	 * Anchor affordances: the id alone is addressable, this makes it usable.
	 *
	 * `:is()` rather than six selectors, here and on the hover rule below. Two
	 * hand-maintained copies of the same heading list is what let the hover rule
	 * silently omit h5 and h6 while this one included them.
	 */
	.markdown-body :global(:is(h1, h2, h3, h4, h5, h6)) {
		/* px, not rem: `.weft-scope` now sets font-size on the root, so `rem`
		   means 14px here and 16px in an embed whose host has not. */
		scroll-margin-top: 16px;
	}
	.markdown-body :global(.heading-anchor) {
		margin-left: 0.35em;
		opacity: 0;
		color: var(--w-text-secondary);
		text-decoration: none;
		font-weight: 400;
	}
	.markdown-body :global(:is(h1, h2, h3, h4, h5, h6):hover .heading-anchor),
	.markdown-body :global(.heading-anchor:focus) {
		opacity: 1;
	}
	.markdown-body :global(:target) {
		background: var(--w-accent-subtle);
		border-radius: 4px;
	}

	/*
	 * Included content is visibly attributed: a subtle frame with a margin
	 * marker linking to the source node, so a reader knows what they are inside
	 * of and can jump to the origin.
	 */
	.markdown-body :global(.weft-include) {
		margin: 1em 0;
		padding: 0 16px 4px;
		border-left: 3px solid var(--w-accent-subtle, var(--w-border));
		border-radius: 0 6px 6px 0;
		background: var(--w-bg-secondary);
	}
	.markdown-body :global(.weft-include-source) {
		font-size: 12px;
		padding: 6px 0 2px;
		color: var(--w-text-secondary);
	}
	.markdown-body :global(.weft-include-source::before) {
		content: "⇱ included from ";
	}
	.markdown-body :global(.weft-include-origin) {
		color: var(--w-text-secondary);
		font-family: var(--w-font-mono);
		font-size: 11px;
	}
	.markdown-body :global(.weft-include-notice) {
		font-size: 12px;
		color: var(--w-text-secondary);
		font-style: italic;
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
		font-family: var(--w-font-mono);
		font-size: 11px;
		color: var(--w-text-secondary);
		background: var(--w-bg-elevated);
		border-left: 1px solid var(--w-border);
		border-bottom: 1px solid var(--w-border);
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
		color: var(--w-code-keyword);
	}
	.markdown-body :global(.hljs-string),
	.markdown-body :global(.hljs-regexp),
	.markdown-body :global(.hljs-addition) {
		color: var(--w-code-string);
	}
	.markdown-body :global(.hljs-number),
	.markdown-body :global(.hljs-symbol),
	.markdown-body :global(.hljs-bullet) {
		color: var(--w-code-number);
	}
	.markdown-body :global(.hljs-comment),
	.markdown-body :global(.hljs-quote) {
		color: var(--w-code-comment);
		font-style: italic;
	}
	.markdown-body :global(.hljs-title),
	.markdown-body :global(.hljs-name),
	.markdown-body :global(.hljs-built_in) {
		color: var(--w-code-function);
	}
	.markdown-body :global(.hljs-attr),
	.markdown-body :global(.hljs-attribute),
	.markdown-body :global(.hljs-variable),
	.markdown-body :global(.hljs-template-variable) {
		color: var(--w-code-variable);
	}
	.markdown-body :global(.hljs-type),
	.markdown-body :global(.hljs-class .hljs-title),
	.markdown-body :global(.hljs-params) {
		color: var(--w-code-type);
	}
	.markdown-body :global(.hljs-meta),
	.markdown-body :global(.hljs-deletion) {
		color: var(--w-code-meta);
	}
	.markdown-body :global(.hljs-emphasis) {
		font-style: italic;
	}
	.markdown-body :global(.hljs-strong) {
		font-weight: 600;
	}
</style>
