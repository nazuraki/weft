<script lang="ts">
import type { WeftClient } from "$lib/client.js";
import { WEFT_CLIENT_KEY } from "$lib/client.js";
import type { RenderOptions } from "$lib/markdown.js";
import type { WeftEdge } from "@lepid-labs/weft-core/browser";
import { getContext } from "svelte";
import MarkdownRenderer from "./MarkdownRenderer.svelte";
import OpenApiRenderer from "./OpenApiRenderer.svelte";

interface Props extends Omit<RenderOptions, "includes"> {
	nodeId: string;
	anchor?: string;
	nodeType?: "markdown" | "openapi" | "artifact";
	/** Manifest edges, so the renderer can expand this document's includes. */
	edges?: WeftEdge[];
	onnavigate: (nodeId: string, anchor?: string) => void;
}

let {
	nodeId,
	anchor,
	nodeType,
	edges,
	onnavigate,
	remarkPlugins,
	rehypePlugins,
	extendSchema,
}: Props = $props();

const client = getContext<WeftClient>(WEFT_CLIENT_KEY);

// The render pipeline knows nothing of clients or manifests; this is where the
// two meet. No edges supplied means include links render as the ordinary links
// they also are.
let includes = $derived(
	edges ? { nodeId, edges, fetchDoc: (id: string) => client.fetchDoc(id) } : undefined
);

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

let root: HTMLDivElement | undefined = $state();

/**
 * Scroll to the anchor (markdown only; the openapi renderer handles its own).
 *
 * Driven by the renderer's `onrendered` rather than by `loading`, because those
 * are different moments: rendering is async, so when the fetch settles the DOM
 * still holds the *previous* document — or nothing at all. Keying on `loading`
 * meant `querySelector` ran against an empty container and silently found
 * nothing, so an anchor into a document you were navigating *to* never scrolled,
 * while an anchor inside the document you were already on always did. That is
 * exactly the flow `mountDoc`'s `onNavigate` feeds.
 *
 * Scoped to this mount rather than the document: an embedded reader must not
 * scroll something on the host's page that happens to share an id with one of
 * its headings — and after slugging, ids are exactly the shape a host's own
 * markup uses (`overview`, `intro`).
 */
function scrollToAnchor() {
	if (!anchor || !root) return;

	// `#` alone is a legal href and an illegal selector; without this guard
	// `querySelector("#")` throws out of the effect.
	const id = anchor.replace(/^#/, "");
	if (!id) return;

	// A slug may begin with a digit, which is a legal id and an illegal
	// selector — `querySelector("#2024-roadmap")` throws rather than missing.
	root.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth" });
}

// The other half: when only the anchor changes, the document does not
// re-render, so nothing fires `onrendered`. Reading `anchor` here is what
// tracks it; before the first render this finds nothing and `onrendered`
// follows up.
$effect(() => {
	if (nodeType !== "openapi") scrollToAnchor();
});
</script>

<div class="doc-view" bind:this={root}>
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
		<MarkdownRenderer
			{content}
			{onnavigate}
			onrendered={scrollToAnchor}
			{remarkPlugins}
			{rehypePlugins}
			{extendSchema}
			{includes}
		/>
	{/if}
</div>

<style>
	.doc-view {
		max-width: 800px;
		margin: 0 auto;
	}
	.loading, .error, .artifact {
		color: var(--w-text-secondary);
	}
	.error {
		color: var(--nb-danger, #b3261e);
	}
</style>
