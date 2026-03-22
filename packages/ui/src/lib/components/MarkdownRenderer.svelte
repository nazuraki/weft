<script lang="ts">
	import { unified } from 'unified';
	import remarkParse from 'remark-parse';
	import remarkGfm from 'remark-gfm';
	import remarkRehype from 'remark-rehype';
	import rehypeStringify from 'rehype-stringify';

	interface Props {
		content: string;
		onnavigate: (nodeId: string, anchor?: string) => void;
	}

	let { content, onnavigate }: Props = $props();
	let htmlContent = $state('');
	let container: HTMLDivElement | undefined = $state();

	$effect(() => {
		renderMarkdown(content);
	});

	async function renderMarkdown(md: string) {
		const result = await unified()
			.use(remarkParse)
			.use(remarkGfm)
			.use(remarkRehype, { allowDangerousHtml: true })
			.use(rehypeStringify, { allowDangerousHtml: true })
			.process(md);
		htmlContent = String(result);
	}

	// Intercept link clicks for in-app navigation
	function handleClick(e: MouseEvent) {
		const target = (e.target as HTMLElement).closest('a');
		if (!target) return;

		const href = target.getAttribute('href');
		if (!href) return;

		// Skip external links
		if (href.startsWith('http://') || href.startsWith('https://')) return;

		// Skip anchor-only links (let browser handle)
		if (href.startsWith('#')) return;

		e.preventDefault();

		const [path, anchor] = href.split('#');
		onnavigate(path, anchor ? `#${anchor}` : undefined);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="markdown-body" bind:this={container} onclick={handleClick}>
	{@html htmlContent}
</div>

<style>
	.markdown-body {
		line-height: 1.6;
		word-wrap: break-word;
	}
	.markdown-body :global(h1) {
		font-size: 2em;
		margin: 0.67em 0;
		padding-bottom: 0.3em;
		border-bottom: 1px solid var(--color-border);
	}
	.markdown-body :global(h2) {
		font-size: 1.5em;
		margin: 1em 0 0.5em;
		padding-bottom: 0.3em;
		border-bottom: 1px solid var(--color-border);
	}
	.markdown-body :global(h3) {
		font-size: 1.25em;
		margin: 1em 0 0.5em;
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
	.markdown-body :global(table) {
		border-collapse: collapse;
		width: 100%;
		margin: 1em 0;
	}
	.markdown-body :global(th), .markdown-body :global(td) {
		border: 1px solid var(--color-border);
		padding: 6px 13px;
	}
	.markdown-body :global(th) {
		background: var(--color-bg-secondary);
		font-weight: 600;
	}
</style>
