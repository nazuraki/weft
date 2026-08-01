<script lang="ts">
import type { WeftClient } from "$lib/client.js";
import { WEFT_CLIENT_KEY } from "$lib/client.js";
import { getContext } from "svelte";
import MarkdownRenderer from "./MarkdownRenderer.svelte";
import OpenApiRenderer from "./OpenApiRenderer.svelte";

interface Props {
	nodeId: string;
	anchor?: string;
	nodeType?: "markdown" | "openapi" | "artifact";
	onnavigate: (nodeId: string, anchor?: string) => void;
}

let { nodeId, anchor, nodeType, onnavigate }: Props = $props();

const client = getContext<WeftClient>(WEFT_CLIENT_KEY);

let content = $state("");
let loading = $state(true);
let error = $state("");

// An artifact is never fetched. Reading a binary as text succeeds and returns a
// lossy decode, so without this the renderer would be handed mojibake and draw
// it as if it were the document.
$effect(() => {
	if (nodeType !== "openapi" && nodeType !== "artifact") loadDoc(nodeId);
});

async function loadDoc(id: string) {
	loading = true;
	error = "";
	try {
		content = await client.fetchDoc(id);
	} catch (e) {
		error = e instanceof Error ? e.message : "Failed to load document";
	} finally {
		loading = false;
	}
}

// Scroll to anchor after content loads (markdown only; openapi renderer handles its own)
$effect(() => {
	if (!loading && anchor && nodeType !== "openapi") {
		const el = document.getElementById(anchor.replace("#", ""));
		if (el) el.scrollIntoView({ behavior: "smooth" });
	}
});
</script>

<div class="doc-view">
	{#if nodeType === 'artifact'}
		<p class="artifact">
			<strong>{nodeId}</strong> is a generated output. Weft tracks it so its sources can be
			checked, but there is nothing here to render.
		</p>
	{:else if nodeType === 'openapi'}
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
	.loading, .error, .artifact {
		color: var(--color-text-secondary);
	}
	.error {
		color: #d1242f;
	}
</style>
