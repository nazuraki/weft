<script lang="ts">
	import type { PageData } from './$types.js';
	import DocTree from '$lib/components/DocTree.svelte';
	import DocView from '$lib/components/DocView.svelte';
	import LinkedItems from '$lib/components/LinkedItems.svelte';
	import SearchPalette from '$lib/components/SearchPalette.svelte';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { navigationStack, currentNode, canGoBack } from '$lib/stores/navigation.js';

	let { data }: { data: PageData } = $props();
	let showSearch = $state(false);

	// Initialize navigation to entry point
	$effect(() => {
		if (data.manifest.nodes.length > 0) {
			const entry = data.manifest.nodes.find((n) => n.id === 'README.md') ?? data.manifest.nodes[0];
			navigationStack.reset({ nodeId: entry.id, title: entry.title });
		}
	});

	function handleNavigate(nodeId: string, anchor?: string) {
		const node = data.manifest.nodes.find((n) => n.id === nodeId);
		navigationStack.push({ nodeId, anchor, title: node?.title ?? nodeId });
	}

	function handleBack() {
		navigationStack.pop();
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			showSearch = !showSearch;
		}
		if (e.key === 'Escape' && showSearch) {
			showSearch = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Header bar -->
<header class="header">
	<div class="header-left">
		<strong>Weft</strong>
	</div>
	<div class="header-center">
		<Breadcrumbs onnavigate={handleNavigate} />
	</div>
	<div class="header-right">
		<button class="search-trigger" onclick={() => showSearch = true}>
			Search
			<kbd>⌘K</kbd>
		</button>
	</div>
</header>

<!-- Left-hand nav -->
<aside class="lhn">
	<DocTree nodes={data.manifest.nodes} onnavigate={handleNavigate} currentNodeId={$currentNode?.nodeId} />
</aside>

<!-- Main content -->
<main class="main">
	{#if $currentNode}
		{#if $canGoBack}
			<button class="back-btn" onclick={handleBack}>← Back</button>
		{/if}
		<DocView
			nodeId={$currentNode.nodeId}
			anchor={$currentNode.anchor}
			nodeType={data.manifest.nodes.find((n) => n.id === $currentNode.nodeId)?.type}
			onnavigate={handleNavigate}
		/>
	{:else}
		<p class="empty">No documents found.</p>
	{/if}
</main>

<!-- Right-hand sidebar -->
<aside class="rhs">
	{#if $currentNode}
		<LinkedItems nodeId={$currentNode.nodeId} manifest={data.manifest} onnavigate={handleNavigate} />
	{/if}
</aside>

{#if showSearch}
	<SearchPalette
		onclose={() => showSearch = false}
		onselect={(id, anchor) => { handleNavigate(id, anchor); showSearch = false; }}
	/>
{/if}

<style>
	.header {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		padding: 0 16px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg);
		gap: 16px;
	}
	.header-left {
		width: calc(var(--lhn-width) - 32px);
		flex-shrink: 0;
	}
	.header-center {
		flex: 1;
		min-width: 0;
	}
	.header-right {
		flex-shrink: 0;
	}
	.search-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 12px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 13px;
	}
	.search-trigger:hover {
		border-color: var(--color-text-secondary);
	}
	.search-trigger kbd {
		font-family: var(--font-sans);
		font-size: 11px;
		padding: 1px 4px;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: var(--color-bg);
	}

	.lhn {
		grid-row: 2;
		border-right: 1px solid var(--color-border);
		overflow-y: auto;
		padding: 8px 0;
		background: var(--color-bg-secondary);
	}

	.main {
		grid-row: 2;
		overflow-y: auto;
		padding: 24px 32px;
	}

	.rhs {
		grid-row: 2;
		border-left: 1px solid var(--color-border);
		overflow-y: auto;
		padding: 12px;
		background: var(--color-bg-secondary);
	}

	.back-btn {
		background: none;
		border: none;
		color: var(--color-link);
		cursor: pointer;
		padding: 4px 0;
		margin-bottom: 8px;
		font-size: 13px;
	}
	.back-btn:hover {
		text-decoration: underline;
	}

	.empty {
		color: var(--color-text-secondary);
		text-align: center;
		margin-top: 48px;
	}
</style>
