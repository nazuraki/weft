<script lang="ts">
import { type LinkedItem, linkedItems } from "$lib/linked-items.js";
import type { Manifest } from "@weft/core";

interface Props {
	nodeId: string;
	manifest: Manifest;
	onnavigate: (nodeId: string, anchor?: string) => void;
}

let { nodeId, manifest, onnavigate }: Props = $props();

let items = $derived(linkedItems(manifest, nodeId));
let outgoing = $derived(items.outgoing);
let incoming = $derived(items.incoming);
</script>

<!--
	An unresolvable target is shown rather than dropped — a broken reference is
	signal, and hiding it would leave `weft analyze` the only way to find
	something the sidebar is looking straight at. It is not a button, because
	clicking one used to navigate to a node that does not exist.
-->
{#snippet row(item: LinkedItem)}
	{#if item.resolved}
		<button
			class="edge-link"
			title={item.resolvedFrom ? `Linked as ${item.resolvedFrom}` : undefined}
			onclick={() => onnavigate(item.target, item.anchor)}
		>
			<span class="edge-target">{item.label}</span>
			{#if item.anchor}<span class="edge-anchor">{item.anchor}</span>{/if}
			{#if item.edge.label}<span class="edge-label">{item.edge.label}</span>{/if}
		</button>
	{:else}
		<div class="edge-link unresolved" title="No document with this id is in the graph">
			<span class="edge-target">{item.target}</span>
			{#if item.anchor}<span class="edge-anchor">{item.anchor}</span>{/if}
			<span class="edge-missing">not found</span>
		</div>
	{/if}
{/snippet}

<div class="linked-items">
	{#if outgoing.length === 0 && incoming.length === 0}
		<p class="empty">No linked items</p>
	{/if}

	{#if outgoing.length > 0}
		<h3 class="section-title">Outgoing</h3>
		<ul class="edge-list">
			{#each outgoing as item}
				<li>{@render row(item)}</li>
			{/each}
		</ul>
	{/if}

	{#if incoming.length > 0}
		<h3 class="section-title">Incoming</h3>
		<ul class="edge-list">
			{#each incoming as item}
				<li>{@render row(item)}</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.linked-items {
		font-size: 13px;
	}
	.section-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 12px 0 6px;
		font-weight: 600;
	}
	.edge-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.edge-link {
		display: flex;
		flex-direction: column;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 6px 8px;
		cursor: pointer;
		border-radius: 4px;
		gap: 2px;
	}
	.edge-link:hover {
		background: var(--color-accent-subtle);
	}
	.edge-target {
		color: var(--color-link);
		font-weight: 500;
	}
	.unresolved {
		cursor: default;
	}
	.unresolved:hover {
		background: none;
	}
	.unresolved .edge-target {
		color: var(--color-text-secondary);
		font-family: var(--font-mono);
		font-size: 12px;
		text-decoration: line-through;
	}
	.edge-missing {
		color: var(--color-text-secondary);
		font-size: 11px;
		font-style: italic;
	}
	.edge-anchor {
		color: var(--color-text-secondary);
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.edge-label {
		color: var(--color-text-secondary);
		font-size: 12px;
	}
	.empty {
		color: var(--color-text-secondary);
		font-style: italic;
		padding: 8px;
	}
</style>
