<script lang="ts">
	import MarkdownRenderer from './MarkdownRenderer.svelte';

	interface Props {
		nodeId: string;
		anchor?: string;
		onnavigate: (nodeId: string, anchor?: string) => void;
	}

	let { nodeId, anchor, onnavigate }: Props = $props();

	let content = $state('');
	let loading = $state(true);
	let error = $state('');

	$effect(() => {
		loadDoc(nodeId);
	});

	async function loadDoc(id: string) {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/doc/${id}`);
			if (!res.ok) throw new Error(`Failed to load: ${res.statusText}`);
			const data = await res.json();
			content = data.content;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load document';
		} finally {
			loading = false;
		}
	}

	// Scroll to anchor after content loads
	$effect(() => {
		if (!loading && anchor) {
			const el = document.getElementById(anchor.replace('#', ''));
			if (el) el.scrollIntoView({ behavior: 'smooth' });
		}
	});
</script>

<div class="doc-view">
	{#if loading}
		<p class="loading">Loading...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else if nodeId.endsWith('.yaml') || nodeId.endsWith('.yml')}
		<pre class="code-block"><code>{content}</code></pre>
	{:else}
		<MarkdownRenderer {content} {onnavigate} />
	{/if}
</div>

<style>
	.doc-view {
		max-width: 800px;
		margin: 0 auto;
	}
	.loading, .error {
		color: var(--color-text-secondary);
	}
	.error {
		color: #d1242f;
	}
	.code-block {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 16px;
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.45;
	}
</style>
