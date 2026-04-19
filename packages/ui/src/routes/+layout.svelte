<script lang="ts">
import "../app.css";
import { WEFT_CLIENT_KEY } from "$lib/client.js";
import { ApiClient } from "$lib/clients/api.js";
import { setContext } from "svelte";
import type { Snippet } from "svelte";
import type { LayoutData } from "./$types.js";

setContext(WEFT_CLIENT_KEY, new ApiClient());

let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<svelte:head>
	{#if data.defaultTheme}
		<meta name="weft-default-theme" content={data.defaultTheme} />
	{/if}
</svelte:head>

<div style="height: 100vh;">
	{@render children()}
</div>
