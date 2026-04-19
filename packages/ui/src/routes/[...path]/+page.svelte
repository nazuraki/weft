<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import WeftApp from "$lib/components/WeftApp.svelte";
import type { PageData } from "./$types.js";

let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.og.siteTitle ? `${data.og.title} — ${data.og.siteTitle}` : data.og.title}</title>
	<meta property="og:title" content={data.og.title} />
	<meta property="og:type" content="website" />
	{#if data.og.description}
		<meta name="description" content={data.og.description} />
		<meta property="og:description" content={data.og.description} />
	{/if}
	{#if data.og.image}
		{@const imageUrl = data.og.siteUrl ? new URL(data.og.image, data.og.siteUrl).href : data.og.image}
		<meta property="og:image" content={imageUrl} />
	{/if}
	{#if data.og.siteTitle}
		<meta property="og:site_name" content={data.og.siteTitle} />
	{/if}
	{#if data.og.siteUrl}
		<meta property="og:url" content={data.og.siteUrl} />
	{/if}
	<meta name="twitter:card" content={data.og.image ? "summary_large_image" : "summary"} />
</svelte:head>

<WeftApp manifest={data.manifest} layout={data.layout} currentNodeId={data.nodeId} anchor={$page.url.hash || undefined} navigate={goto} />
