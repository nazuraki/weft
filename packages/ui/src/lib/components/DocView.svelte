<script lang="ts">
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import OpenApiRenderer from './OpenApiRenderer.svelte';

	interface Props {
		nodeId: string;
		anchor?: string;
		nodeType?: 'markdown' | 'openapi';
		onnavigate: (nodeId: string, anchor?: string) => void;
	}

	let { nodeId, anchor, nodeType, onnavigate }: Props = $props();

	let content = $state('');
	let loading = $state(true);
	let error = $state('');

	$effect(() => {
		if (nodeType !== 'openapi') loadDoc(nodeId);
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

	// Scroll to anchor after content loads (markdown only; openapi renderer handles its own)
	$effect(() => {
		if (!loading && anchor && nodeType !== 'openapi') {
			const el = document.getElementById(anchor.replace('#', ''));
			if (el) el.scrollIntoView({ behavior: 'smooth' });
		}
	});
</script>

<div class="doc-view">
	{#if nodeType === 'openapi'}
		<OpenApiRenderer {nodeId} {anchor} />
	{:else if loading}
		<p class="loading">Loading...</p>
	{:else if error}
		<p class="error">{error}</p>
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
</style>
