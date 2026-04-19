<script lang="ts">
import { theme } from "$lib/stores/theme.svelte.js";
import { nodeIdToPath } from "$lib/utils/paths.js";
import type { Manifest } from "@weft/core";
import DocTree from "./DocTree.svelte";
import DocView from "./DocView.svelte";
import LinkedItems from "./LinkedItems.svelte";
import SearchPalette from "./SearchPalette.svelte";

interface Props {
	manifest: Manifest;
	layout?: "reader" | "default";
	currentNodeId: string;
	anchor?: string;
	navigate: (path: string) => void;
}

let { manifest, layout = "default", currentNodeId, anchor, navigate }: Props = $props();

let showSearch = $state(false);

let readerMode = $derived(layout === "reader");

let currentNode = $derived(manifest.nodes.find((n) => n.id === currentNodeId) ?? null);

$effect(() => {
	theme.init();
});

$effect(() => {
	theme.setDocOverride(currentNode?.theme ?? null);
});

function handleNavigate(nodeId: string, anchor?: string) {
	navigate(nodeIdToPath(nodeId) + (anchor ?? ""));
}

function handleKeydown(e: KeyboardEvent) {
	if ((e.metaKey || e.ctrlKey) && e.key === "k") {
		e.preventDefault();
		showSearch = !showSearch;
	}
	if (e.key === "Escape" && showSearch) {
		showSearch = false;
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="shell" class:reader={readerMode}>
	<!-- Header bar -->
	<header class="header">
		<div class="header-left">
			<span class="wordmark">Weft</span>
		</div>
		<div class="header-center">
			{#if currentNode}
				<span class="doc-title">{currentNode.title}</span>
			{/if}
		</div>
		<div class="header-right">
				<span class="theme-toggle-wrap">
				<button
					class="theme-toggle"
					onclick={(e) => e.shiftKey || e.ctrlKey ? theme.toggleDocOverride() : theme.toggle()}
					aria-label="Toggle light/dark mode"
				>
					{theme.current === "dark" ? "☀️" : "🌙"}
				</button>
				<span class="theme-tooltip">
					Click to toggle &amp; save preference<br />
					Shift/Ctrl+click to override this document
				</span>
			</span>
				<button class="search-trigger" onclick={() => (showSearch = true)}>
					Search
					<kbd>⌘K</kbd>
				</button>
			</div>
	</header>

	<!-- Left-hand nav -->
	<aside class="lhn">
		<DocTree
			nodes={manifest.nodes}
			onnavigate={handleNavigate}
			{currentNodeId}
		/>
	</aside>

	<!-- Main content -->
	<main class="main" data-theme={theme.docOverride ?? undefined}>
		{#if currentNode}
			<DocView
				nodeId={currentNode.id}
				nodeType={currentNode.type}
				{anchor}
				onnavigate={handleNavigate}
			/>
		{:else}
			<p class="empty">No documents found.</p>
		{/if}
	</main>

	<!-- Right-hand sidebar (hidden in reader mode) -->
	{#if !readerMode}
		<aside class="rhs">
			{#if currentNode}
				<LinkedItems nodeId={currentNode.id} {manifest} onnavigate={handleNavigate} />
			{/if}
		</aside>
	{/if}
</div>

{#if showSearch}
	<SearchPalette
		onclose={() => (showSearch = false)}
		onselect={(id, anchor) => {
			handleNavigate(id, anchor);
			showSearch = false;
		}}
	/>
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--lhn-width, 260px) 1fr var(--rhs-width, 300px);
		grid-template-rows: var(--header-height, 48px) 1fr;
		height: 100%;
		overflow: hidden;
	}
	.shell.reader {
		grid-template-columns: var(--lhn-width, 260px) 1fr;
	}

	.header {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		padding: 0 16px;
		gap: 16px;
	}
	.header-left {
		width: calc(var(--lhn-width, 240px) - 32px);
		flex-shrink: 0;
	}
	.wordmark {
		font-family: var(--font-heading, var(--font-sans));
		font-weight: 600;
		font-size: 0.9375rem;
		letter-spacing: 0.04em;
		color: var(--color-accent);
		text-transform: uppercase;
	}
	.header-center {
		flex: 1;
		min-width: 0;
	}
	.doc-title {
		font-size: 13px;
		color: var(--color-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.header-right {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.theme-toggle-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}
	.theme-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-bg-secondary);
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
	}
	.theme-toggle:hover {
		border-color: var(--color-text-secondary);
	}
	.theme-tooltip {
		display: none;
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 11px;
		line-height: 1.6;
		color: var(--color-text-secondary);
		white-space: nowrap;
		pointer-events: none;
		z-index: 100;
	}
	.theme-toggle-wrap:hover .theme-tooltip {
		display: block;
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
		grid-column: 1;
		grid-row: 2;
		overflow-y: auto;
		padding: 12px 0;
		min-width: 0;
	}

	.main {
		grid-column: 2;
		grid-row: 2;
		overflow-y: auto;
		padding: 24px 32px;
		min-width: 0;
		background: var(--color-bg);
		color: var(--color-text);
	}

	.rhs {
		grid-column: 3;
		grid-row: 2;
		border-left: 1px solid var(--color-border);
		overflow-y: auto;
		padding: 16px;
		background: var(--color-bg-secondary, var(--color-bg));
		min-width: 0;
	}


	.empty {
		color: var(--color-text-secondary);
		text-align: center;
		margin-top: 48px;
	}
</style>
