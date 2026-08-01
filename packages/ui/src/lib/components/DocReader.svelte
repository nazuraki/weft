<script lang="ts">
import type { RenderOptions } from "$lib/markdown.js";
import type { Manifest } from "@weft/core";
import DocView from "./DocView.svelte";
import LinkedItems from "./LinkedItems.svelte";

interface Props extends RenderOptions {
	manifest: Manifest;
	nodeId: string;
	anchor?: string;
	/** Show the linked-items sidebar. Off by default — the host asks for it. */
	linkedItems?: boolean;
	/**
	 * Where a link inside the document leads.
	 *
	 * An output, not an instruction: this mount never changes what it shows. The
	 * host owns its URL and its history, and re-renders with a new `nodeId` if
	 * and when it decides to.
	 */
	onnavigate?: (nodeId: string, anchor?: string) => void;
}

let {
	manifest,
	nodeId,
	anchor,
	linkedItems = false,
	onnavigate,
	remarkPlugins,
	rehypePlugins,
	extendSchema,
}: Props = $props();

let currentNode = $derived(manifest.nodes.find((node) => node.id === nodeId) ?? null);

function handleNavigate(id: string, hash?: string) {
	onnavigate?.(id, hash);
}
</script>

<!--
	The reader, and nothing around it: no header, no document tree, no search
	palette, and no window-level key handler. A host that already has those would
	otherwise get a second set fighting its own.

	`theme.init()` is deliberately absent too. It writes `data-theme` onto
	documentElement, which is correct for an app that is the whole page and wrong
	for one panel inside someone else's — the host sets the attribute on this
	container if it wants Weft's dark scheme, or leaves it and inherits.
-->
<div class="weft-scope weft-doc">
	{#if currentNode}
		<div class="doc" class:with-sidebar={linkedItems}>
			<main class="reader">
				<DocView
					nodeId={currentNode.id}
					nodeType={currentNode.type}
					{anchor}
					onnavigate={handleNavigate}
					{remarkPlugins}
					{rehypePlugins}
					{extendSchema}
				/>
			</main>

			{#if linkedItems}
				<aside class="linked">
					<LinkedItems nodeId={currentNode.id} {manifest} onnavigate={handleNavigate} />
				</aside>
			{/if}
		</div>
	{:else}
		<p class="missing">No document with id “{nodeId}”.</p>
	{/if}
</div>

<style>
	.doc {
		display: grid;
		grid-template-columns: 1fr;
		gap: 24px;
	}
	.doc.with-sidebar {
		grid-template-columns: 1fr var(--w-rhs-width, 260px);
	}
	.reader {
		min-width: 0;
	}
	.linked {
		min-width: 0;
	}
	.missing {
		color: var(--w-text-secondary);
		font-style: italic;
	}
</style>
