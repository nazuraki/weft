<script lang="ts">
import type { WeftClient } from "$lib/client.js";
import { WEFT_CLIENT_KEY } from "$lib/client.js";
import type { SearchResult } from "@weft/core";
import { getContext } from "svelte";

interface Props {
	onclose: () => void;
	onselect: (id: string, anchor?: string) => void;
}

let { onclose, onselect }: Props = $props();

const client = getContext<WeftClient>(WEFT_CLIENT_KEY);

let query = $state("");
let results = $state<SearchResult[]>([]);
let selectedIndex = $state(0);
let inputEl: HTMLInputElement | undefined = $state();

$effect(() => {
	inputEl?.focus();
});

let searchTimer: ReturnType<typeof setTimeout> | undefined;

function handleInput() {
	clearTimeout(searchTimer);
	if (!query.trim()) {
		results = [];
		return;
	}
	searchTimer = setTimeout(async () => {
		try {
			results = await client.search(query);
			selectedIndex = 0;
		} catch {
			// Ignore search errors
		}
	}, 150);
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "ArrowDown") {
		e.preventDefault();
		selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
	} else if (e.key === "ArrowUp") {
		e.preventDefault();
		selectedIndex = Math.max(selectedIndex - 1, 0);
	} else if (e.key === "Enter" && results[selectedIndex]) {
		e.preventDefault();
		onselect(results[selectedIndex].id);
	} else if (e.key === "Escape") {
		onclose();
	}
}

function handleBackdropClick(e: MouseEvent) {
	if (e.target === e.currentTarget) onclose();
}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={handleBackdropClick}>
	<div class="palette">
		<input
			bind:this={inputEl}
			bind:value={query}
			oninput={handleInput}
			onkeydown={handleKeydown}
			type="text"
			placeholder="Search documents..."
			class="search-input"
		/>
		{#if results.length > 0}
			<ul class="results">
				{#each results as result, i}
					<li>
						<button
							class="result-item"
							class:selected={i === selectedIndex}
							onclick={() => onselect(result.id)}
						>
							<span class="result-title">{result.title}</span>
							<span class="result-id">{result.id}</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if query.trim()}
			<p class="no-results">No results</p>
		{/if}
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		/* The active theme's page color at low alpha, blurred — the design
		 * system's dialog-backdrop treatment, expressed with its tokens. */
		background: color-mix(in srgb, var(--w-bg) 55%, transparent);
		backdrop-filter: blur(calc(var(--nb-blur, 12px) / 2));
		display: flex;
		justify-content: center;
		padding-top: 120px;
		z-index: 100;
	}
	.palette {
		background: var(--w-bg-elevated);
		border: 1px solid var(--w-border);
		border-radius: var(--nb-radius-lg, 12px);
		width: 560px;
		max-height: 400px;
		overflow: hidden;
		/* Elevation is glow, not grey shadow — luminous-precision's rule. */
		box-shadow: 0 0 32px var(--w-accent-subtle);
		display: flex;
		flex-direction: column;
		align-self: flex-start;
	}
	.search-input {
		width: 100%;
		padding: 14px 18px;
		border: none;
		border-bottom: 1px solid var(--w-border);
		font-size: 16px;
		outline: none;
		background: transparent;
		color: var(--w-text);
		font-family: var(--w-font-sans);
	}
	.search-input:focus {
		border-bottom-color: var(--nb-accent, var(--w-accent));
	}
	.results {
		list-style: none;
		padding: 4px;
		margin: 0;
		overflow-y: auto;
	}
	.result-item {
		display: flex;
		flex-direction: column;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 8px 14px;
		cursor: pointer;
		border-radius: 8px;
		gap: 2px;
	}
	.result-item:hover,
	.result-item.selected {
		background: var(--w-accent-subtle);
	}
	.result-title {
		font-weight: 500;
		color: var(--w-text);
	}
	.result-id {
		font-size: 12px;
		color: var(--w-text-secondary);
		font-family: var(--w-font-mono);
	}
	.no-results {
		padding: 16px;
		text-align: center;
		color: var(--w-text-secondary);
	}
</style>
