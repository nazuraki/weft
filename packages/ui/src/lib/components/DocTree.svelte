<script lang="ts">
	import type { WeftNode } from '@weft/core';

	interface Props {
		nodes: WeftNode[];
		currentNodeId?: string;
		onnavigate: (nodeId: string) => void;
	}

	let { nodes, currentNodeId, onnavigate }: Props = $props();

	// Build a simple tree from flat node IDs by splitting on '/'
	interface TreeNode {
		name: string;
		nodeId?: string;
		children: TreeNode[];
	}

	function buildTree(nodes: WeftNode[]): TreeNode[] {
		const root: TreeNode[] = [];

		for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
			const parts = node.id.split('/');
			let current = root;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const isLeaf = i === parts.length - 1;

				let existing = current.find((n) => n.name === part);
				if (!existing) {
					existing = { name: part, children: [] };
					if (isLeaf) existing.nodeId = node.id;
					current.push(existing);
				}
				current = existing.children;
			}
		}

		return root;
	}

	let tree = $derived(buildTree(nodes));
</script>

{#snippet treeNode(node: TreeNode, depth: number)}
	{#if node.nodeId}
		<button
			class="tree-item"
			class:active={currentNodeId === node.nodeId}
			style="padding-left: {8 + depth * 16}px"
			onclick={() => onnavigate(node.nodeId!)}
		>
			{node.name}
		</button>
	{:else}
		<div class="tree-folder" style="padding-left: {8 + depth * 16}px">
			{node.name}
		</div>
		{#each node.children as child}
			{@render treeNode(child, depth + 1)}
		{/each}
	{/if}

	{#if node.nodeId}
		<!-- Leaf nodes don't render children -->
	{:else}
		<!-- Children already rendered above -->
	{/if}
{/snippet}

<nav class="doc-tree">
	{#each tree as node}
		{@render treeNode(node, 0)}
	{/each}
</nav>

<style>
	.doc-tree {
		font-size: 13px;
	}
	.tree-item {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 4px 12px;
		cursor: pointer;
		color: var(--color-text);
		border-radius: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tree-item:hover {
		background: var(--color-accent-subtle);
	}
	.tree-item.active {
		background: var(--color-accent-subtle);
		color: var(--color-accent);
		font-weight: 600;
	}
	.tree-folder {
		padding: 4px 12px;
		font-weight: 600;
		color: var(--color-text-secondary);
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-top: 8px;
	}
</style>
