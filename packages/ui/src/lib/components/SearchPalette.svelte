<script lang="ts">
	import type { SearchResult } from '@weft/core';

	interface Props {
		onclose: () => void;
		onselect: (id: string, anchor?: string) => void;
	}

	let { onclose, onselect }: Props = $props();

	let query = $state('');
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
				const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
				if (res.ok) {
					results = await res.json();
					selectedIndex = 0;
				}
			} catch {
				// Ignore search errors
			}
		}, 150);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter' && results[selectedIndex]) {
			e.preventDefault();
			onselect(results[selectedIndex].id);
		} else if (e.key === 'Escape') {
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
		background: rgba(0, 0, 0, 0.3);
		display: flex;
		justify-content: center;
		padding-top: 120px;
		z-index: 100;
	}
	.palette {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		width: 560px;
		max-height: 400px;
		overflow: hidden;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
		display: flex;
		flex-direction: column;
		align-self: flex-start;
	}
	.search-input {
		width: 100%;
		padding: 14px 18px;
		border: none;
		border-bottom: 1px solid var(--color-border);
		font-size: 16px;
		outline: none;
		background: transparent;
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
		background: var(--color-accent-subtle);
	}
	.result-title {
		font-weight: 500;
		color: var(--color-text);
	}
	.result-id {
		font-size: 12px;
		color: var(--color-text-secondary);
		font-family: var(--font-mono);
	}
	.no-results {
		padding: 16px;
		text-align: center;
		color: var(--color-text-secondary);
	}
</style>
