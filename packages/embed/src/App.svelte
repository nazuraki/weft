<script lang="ts">
import { WEFT_CLIENT_KEY } from "$lib/client.js";
import WeftApp from "$lib/components/WeftApp.svelte";
import type { Manifest } from "@weft/core/browser";
import { setContext } from "svelte";
import { GitHubClient } from "./github.js";
import type { EmbedConfig } from "./index.js";

// Import base styles so they're bundled into weft.css
import "$lib/../app.css";

interface Props {
	config: EmbedConfig;
}

let { config }: Props = $props();

// svelte-ignore state_referenced_locally — config is static after mount
const client = new GitHubClient(config);
setContext(WEFT_CLIENT_KEY, client);

let manifest = $state<Manifest | null>(null);
let loadError = $state("");

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
	} catch (e) {
		loadError = e instanceof Error ? e.message : "Failed to load manifest";
	}
}

load();
</script>

{#if loadError}
	<p class="weft-load-error">Weft: {loadError}</p>
{:else if manifest}
	<WeftApp {manifest} />
{:else}
	<p class="weft-loading">Loading…</p>
{/if}

<style>
	.weft-loading,
	.weft-load-error {
		padding: 16px;
		font-family: var(--font-sans, sans-serif);
		color: var(--color-text-secondary, #656d76);
	}
	.weft-load-error {
		color: #d1242f;
	}
</style>
