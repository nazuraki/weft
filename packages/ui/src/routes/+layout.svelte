<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="shell">
	{@render children()}
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--lhn-width) 1fr var(--rhs-width);
		grid-template-rows: var(--header-height) 1fr;
		height: 100vh;
		overflow: hidden;
	}
</style>
