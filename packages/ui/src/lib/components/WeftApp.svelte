<script lang="ts">
import type { RenderOptions } from "$lib/markdown.js";
import { theme } from "$lib/stores/theme.svelte.js";
import { nodeIdToPath } from "$lib/utils/paths.js";
import type { Manifest } from "@weft/core";
import DocTree from "./DocTree.svelte";
import DocView from "./DocView.svelte";
import LinkedItems from "./LinkedItems.svelte";
import SearchPalette from "./SearchPalette.svelte";

interface Props extends RenderOptions {
	manifest: Manifest;
	layout?: "reader" | "default";
	currentNodeId: string;
	anchor?: string;
	navigate: (path: string) => void;
}

let {
	manifest,
	layout = "default",
	currentNodeId,
	anchor,
	navigate,
	remarkPlugins,
	rehypePlugins,
	extendSchema,
}: Props = $props();

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
				{#if theme.canToggle}
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
				{/if}
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
			projects={manifest.projects}
			onnavigate={handleNavigate}
			{currentNodeId}
		/>
	</aside>

	<!-- Main content -->
	<!-- The per-doc override carries both axes: the scheme for anything keyed
	     off data-theme, and the theme name whose token block restyles this
	     subtree (tokens re-declare on this element, so they win over the
	     root's by proximity, not source order). -->
	<main
		class="main"
		data-theme={theme.docOverride ?? undefined}
		data-nb-style={theme.docOverride ? theme.styleFor(theme.docOverride) : undefined}
	>
		{#if currentNode}
			<DocView
				nodeId={currentNode.id}
				nodeType={currentNode.type}
				{anchor}
				edges={manifest.edges}
				onnavigate={handleNavigate}
				{remarkPlugins}
				{rehypePlugins}
				{extendSchema}
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
		grid-template-columns: var(--w-lhn-width, 260px) 1fr var(--w-rhs-width, 300px);
		grid-template-rows: var(--w-header-height, 48px) 1fr;
		height: 100%;
		overflow: hidden;
	}
	.shell.reader {
		grid-template-columns: var(--w-lhn-width, 260px) 1fr;
	}

	.header {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		padding: 0 16px;
		gap: 16px;
	}
	.header-left {
		width: calc(var(--w-lhn-width, 240px) - 32px);
		flex-shrink: 0;
	}
	.wordmark {
		font-family: var(--w-font-heading, var(--w-font-sans));
		font-weight: 600;
		/* 13px, not 15: this was `0.9375rem` against a 14px base that `app-page.css`
		   already set, so it rendered at 13.125px. Converting it to 15px would have
		   been a silent 14% size change inside a commit that claimed to be a
		   mechanical unit swap. */
		font-size: 13px;
		letter-spacing: 0.04em;
		color: var(--w-accent);
		text-transform: uppercase;
	}
	.header-center {
		flex: 1;
		min-width: 0;
	}
	.doc-title {
		font-size: 13px;
		color: var(--w-text-secondary);
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
		border: 1px solid var(--w-border);
		border-radius: 6px;
		background: var(--w-bg-secondary);
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
	}
	.theme-toggle:hover {
		border-color: var(--w-text-secondary);
	}
	.theme-tooltip {
		display: none;
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		background: var(--w-bg-elevated);
		border: 1px solid var(--w-border);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 11px;
		line-height: 1.6;
		color: var(--w-text-secondary);
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
		border: 1px solid var(--w-border);
		border-radius: 6px;
		background: var(--w-bg-secondary);
		color: var(--w-text-secondary);
		cursor: pointer;
		font-size: 13px;
	}
	.search-trigger:hover {
		border-color: var(--w-text-secondary);
	}
	.search-trigger kbd {
		font-family: var(--w-font-sans);
		font-size: 11px;
		padding: 1px 4px;
		border: 1px solid var(--w-border);
		border-radius: 3px;
		background: var(--w-bg);
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
		background: var(--w-bg);
		color: var(--w-text);
	}

	.rhs {
		grid-column: 3;
		grid-row: 2;
		border-left: 1px solid var(--w-border);
		overflow-y: auto;
		padding: 16px;
		background: var(--w-bg-secondary, var(--w-bg));
		min-width: 0;
	}


	.empty {
		color: var(--w-text-secondary);
		text-align: center;
		margin-top: 48px;
	}
</style>
