<script lang="ts">
import { WEFT_CLIENT_KEY } from "$lib/client.js";
import WeftApp from "$lib/components/WeftApp.svelte";
import { resolveStylePair } from "$lib/styles.js";
import { pathToNode } from "$lib/utils/paths.js";
import type { Manifest } from "@lepid-labs/weft-core/browser";
import { setContext } from "svelte";
import { GitHubClient } from "./github.js";
import type { EmbedConfig } from "./index.js";

// Import base styles so they're bundled into weft.css
import "$lib/../app.css";

interface Props {
	config: EmbedConfig;
}

let { config }: Props = $props();

// The theme attributes land on this mount's own container: on a host's
// documentElement they would push --nb-* tokens and a real color-scheme onto
// a page Weft does not own.
let scopeEl: HTMLElement | undefined = $state();
const stylePair = resolveStylePair(config.style);

// svelte-ignore state_referenced_locally — config is static after mount
const client = new GitHubClient(config);
setContext(WEFT_CLIENT_KEY, client);

let manifest = $state<Manifest | null>(null);
let loadError = $state("");
let currentNodeId = $state("");

async function load() {
	const manifestPath = config.manifestPath ?? "docs/.weft/manifest.json";
	const url = client.rawUrl(manifestPath);
	try {
		const headers = config.token ? { Authorization: `token ${config.token}` } : {};
		const res = await fetch(url, { headers });
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		const data: Manifest = await res.json();
		client.buildIndex(data);
		manifest = data;
		const firstProject = data.projects?.[0]?.slug;
		// Open a document the nav actually lists: docOrderStrict keeps hidden docs
		// in the graph, so a README excluded from docOrder is still a node here.
		const visible = data.nodes.filter((n) => !n.hiddenFromNav);
		currentNodeId =
			visible.find((n) => n.id === "README.md")?.id ??
			(firstProject ? visible.find((n) => n.id === `${firstProject}/README.md`)?.id : undefined) ??
			visible[0]?.id ??
			data.nodes[0]?.id ??
			"";
	} catch (e) {
		loadError = e instanceof Error ? e.message : "Failed to load manifest";
	}
}

load();
</script>

<!--
	Scoped for the same reason `mountDoc` is: this bundle no longer ships a
	global reset, so the box model and tokens have to reach the app from its own
	container rather than from the host's document.
-->
<div class="weft-scope weft-app" bind:this={scopeEl}>
{#if loadError}
	<p class="weft-load-error">Weft: {loadError}</p>
{:else if manifest}
	<WeftApp
		{manifest}
		{currentNodeId}
		themeOptions={{ pair: stylePair, root: scopeEl }}
		remarkPlugins={config.remarkPlugins}
		rehypePlugins={config.rehypePlugins}
		extendSchema={config.extendSchema}
		navigate={(path) => {
			const nodeId = pathToNode(path.split("#")[0], manifest!.nodes)?.id;
			if (nodeId) currentNodeId = nodeId;
		}}
	/>
{:else}
	<p class="weft-loading">Loading…</p>
{/if}
</div>

<style>
	.weft-app {
		height: 100%;
	}
	.weft-loading,
	.weft-load-error {
		padding: 16px;
		font-family: var(--w-font-sans, sans-serif);
		color: var(--w-text-secondary, #656d76);
	}
	.weft-load-error {
		color: var(--nb-danger, #b3261e);
	}
</style>
