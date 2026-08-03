<script lang="ts">
import { WEFT_CLIENT_KEY, type WeftClient } from "$lib/client.js";
import DocReader from "$lib/components/DocReader.svelte";
import type { RenderOptions } from "$lib/markdown.js";
import type { Manifest } from "@weft/core/browser";
import { setContext } from "svelte";
import type { DocState } from "./doc-state.svelte.js";

// Tokens and scoped base styles. Not `app-page.css` — a host's page keeps its
// own reset, fonts and background.
import "$lib/../app.css";

interface Props extends RenderOptions {
	client: WeftClient;
	manifest: Manifest;
	state: DocState;
	linkedItems?: boolean;
	onnavigate?: (nodeId: string, anchor?: string) => void;
}

let {
	client,
	manifest,
	state,
	linkedItems = false,
	onnavigate,
	remarkPlugins,
	rehypePlugins,
	extendSchema,
}: Props = $props();

// The host's client, injected the same way the app injects its own.
// svelte-ignore state_referenced_locally — the client is fixed for the mount's life
setContext(WEFT_CLIENT_KEY, client);
</script>

<DocReader
	{manifest}
	nodeId={state.nodeId}
	anchor={state.anchor}
	{linkedItems}
	{onnavigate}
	{remarkPlugins}
	{rehypePlugins}
	{extendSchema}
/>
