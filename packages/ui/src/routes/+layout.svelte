<script lang="ts">
import "../app.css";
import { WEFT_CLIENT_KEY } from "$lib/client.js";
import { ApiClient } from "$lib/clients/api.js";
import { setContext } from "svelte";
import type { Snippet } from "svelte";

setContext(WEFT_CLIENT_KEY, new ApiClient());

let { children }: { children: Snippet } = $props();
</script>

<div style="height: 100vh;">
	{@render children()}
</div>
