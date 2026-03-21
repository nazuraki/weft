<script lang="ts">
	import type { Manifest, WeftEdge } from '@weft/core';

	interface Props {
		nodeId: string;
		manifest: Manifest;
		onnavigate: (nodeId: string, anchor?: string) => void;
	}

	let { nodeId, manifest, onnavigate }: Props = $props();

	let outgoing = $derived(
		manifest.edges.filter((e) => e.from.node === nodeId)
	);
	let incoming = $derived(
		manifest.edges.filter((e) => e.to.node === nodeId)
	);

	function nodeTitle(id: string): string {
		return manifest.nodes.find((n) => n.id === id)?.title ?? id;
	}

	function handleClick(edge: WeftEdge, direction: 'outgoing' | 'incoming') {
		if (direction === 'outgoing') {
			onnavigate(edge.to.node, edge.to.anchor);
		} else {
			onnavigate(edge.from.node, edge.from.anchor);
		}
	}
</script>

<div class="linked-items">
	{#if outgoing.length === 0 && incoming.length === 0}
		<p class="empty">No linked items</p>
	{/if}

	{#if outgoing.length > 0}
		<h3 class="section-title">Outgoing</h3>
		<ul class="edge-list">
			{#each outgoing as edge}
				<li>
					<button class="edge-link" onclick={() => handleClick(edge, 'outgoing')}>
						<span class="edge-target">{nodeTitle(edge.to.node)}</span>
						{#if edge.to.anchor}
							<span class="edge-anchor">{edge.to.anchor}</span>
						{/if}
						{#if edge.label}
							<span class="edge-label">{edge.label}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if incoming.length > 0}
		<h3 class="section-title">Incoming</h3>
		<ul class="edge-list">
			{#each incoming as edge}
				<li>
					<button class="edge-link" onclick={() => handleClick(edge, 'incoming')}>
						<span class="edge-target">{nodeTitle(edge.from.node)}</span>
						{#if edge.from.anchor}
							<span class="edge-anchor">{edge.from.anchor}</span>
						{/if}
						{#if edge.label}
							<span class="edge-label">{edge.label}</span>
						{/if}
					</button>
				</li>
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
