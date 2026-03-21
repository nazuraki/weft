<script lang="ts">
	import { breadcrumbs } from '$lib/stores/navigation.js';

	interface Props {
		onnavigate: (nodeId: string, anchor?: string) => void;
	}

	let { onnavigate }: Props = $props();
</script>

<nav class="breadcrumbs">
	{#each $breadcrumbs as crumb, i}
		{#if i > 0}
			<span class="separator">/</span>
		{/if}
		{#if i < $breadcrumbs.length - 1}
			<button class="crumb" onclick={() => onnavigate(crumb.nodeId, crumb.anchor)}>
				{crumb.title ?? crumb.nodeId}
			</button>
		{:else}
			<span class="crumb current">{crumb.title ?? crumb.nodeId}</span>
		{/if}
	{/each}
</nav>

<style>
	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		overflow: hidden;
		white-space: nowrap;
	}
	.separator {
		color: var(--color-text-secondary);
	}
	.crumb {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--color-link);
		font-size: 13px;
	}
	.crumb:hover {
		text-decoration: underline;
	}
	.crumb.current {
		color: var(--color-text);
		cursor: default;
		font-weight: 500;
	}
</style>
