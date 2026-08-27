<script lang="ts">
import "@nazuraki/styles/all";
import "../app.css";
import "../app-page.css";
import { WEFT_CLIENT_KEY } from "$lib/client.js";
import { ApiClient } from "$lib/clients/api.js";
import { loadRemoteStyles } from "$lib/style-loader.js";
import { fontsFor, isBundledStyle, resolveStylePair } from "$lib/styles.js";
import { setContext } from "svelte";
import type { Snippet } from "svelte";
import type { LayoutData } from "./$types.js";

setContext(WEFT_CLIENT_KEY, new ApiClient());

let { children, data }: { children: Snippet; data: LayoutData } = $props();

// The pair of ui-std-lib themes this deployment renders in. The metas below
// are the whole config channel to the pre-paint script and the theme store —
// an absent half means that scheme does not exist here (toggle hidden).
let pair = $derived(resolveStylePair(data.style ?? undefined));

// Fonts for both halves up front, so the runtime toggle never fetches.
let fontUrls = $derived(fontsFor([pair.dark, pair.light]));

// The escape hatch: a configured name the installed @nazuraki/styles does not
// know is served from styleUrl instead of the bundle. The stylesheet link is
// emitted here (SSR, no flash); its fonts are fetched from the remote
// manifest by the style-loader on the client.
let remoteStyles = $derived(
	data.styleUrl ? [pair.dark, pair.light].filter((s): s is string => !!s && !isBundledStyle(s)) : []
);

$effect(() => {
	if (data.styleUrl && remoteStyles.length) {
		loadRemoteStyles(data.styleUrl, remoteStyles, { stylesheets: false });
	}
});
</script>

<svelte:head>
	{#if data.defaultTheme}
		<meta name="weft-default-theme" content={data.defaultTheme} />
	{/if}
	{#if pair.dark}
		<meta name="weft-style-dark" content={pair.dark} />
	{/if}
	{#if pair.light}
		<meta name="weft-style-light" content={pair.light} />
	{/if}
	{#if data.styleUrl}
		<meta name="weft-style-url" content={data.styleUrl} />
	{/if}
	{#if fontUrls.length}
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	{/if}
	{#each fontUrls as url (url)}
		<link rel="stylesheet" href={url} />
	{/each}
	{#each remoteStyles as name (name)}
		<link rel="stylesheet" href="{data.styleUrl}/{name}/index.css" />
	{/each}
</svelte:head>

<div style="height: 100vh;">
	{@render children()}
</div>
