<script lang="ts">
import WeftApp from "$lib/components/WeftApp.svelte";
import type { PageData } from "./$types.js";

let { data }: { data: PageData } = $props();
</script>

<WeftApp manifest={data.manifest} />
