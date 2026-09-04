<script lang="ts">
import type { RenderOptions } from "$lib/markdown.js";
import { resolveStylePair } from "$lib/styles.js";
import type { Manifest, StyleConfig } from "@lepid-labs/weft-core";
import DocView from "./DocView.svelte";
import LinkedItems from "./LinkedItems.svelte";

interface Props extends RenderOptions {
	manifest: Manifest;
	nodeId: string;
	anchor?: string;
	/** Show the linked-items sidebar. Off by default — the host asks for it. */
	linkedItems?: boolean;
	/** ui-std-lib style: a pair follows the mirrored host scheme; a single name is fixed. */
	style?: StyleConfig;
	/**
	 * Where a link inside the document leads.
	 *
	 * An output, not an instruction: this mount never changes what it shows. The
	 * host owns its URL and its history, and re-renders with a new `nodeId` if
	 * and when it decides to.
	 */
	onnavigate?: (nodeId: string, anchor?: string) => void;
}

let {
	manifest,
	nodeId,
	anchor,
	linkedItems = false,
	style,
	onnavigate,
	remarkPlugins,
	rehypePlugins,
	extendSchema,
}: Props = $props();

let stylePair = $derived(resolveStylePair(style));

let currentNode = $derived(manifest.nodes.find((node) => node.id === nodeId) ?? null);

let root: HTMLDivElement | undefined = $state();
let inheritedTheme = $state<string | null>(null);

/**
 * Mirror the nearest themed ancestor's `data-theme` onto this mount's own root.
 *
 * CSS cannot express "nearest ancestor wins". A host page themed `light` with
 * the mount's container marked `dark` matches BOTH `[data-theme="light"] .weft-scope`
 * and `[data-theme="dark"] .weft-scope` — same element, both (0,2,0) — so source
 * order decides, and a mount that asked to be dark renders light.
 *
 * The old unqualified rules got this right for free, because they declared the
 * tokens on the themed element itself and let inheritance carry them down. That
 * is also exactly why they leaked into the host's markup. Resolving the value
 * here turns an ancestor question into an own-attribute one, which the cascade
 * handles unambiguously — and keeps the rules scoped.
 */
$effect(() => {
	if (!root) return;

	const resolve = () => {
		// From the PARENT, never from `root` itself: this effect writes the
		// attribute onto `root`, and reading it back would latch the first value
		// forever.
		const found = root?.parentElement?.closest("[data-theme]")?.getAttribute("data-theme");
		// Clamped rather than mirrored verbatim. A host themed `solarized-mango`
		// matches no block and falls through to the light base either way — but
		// republishing their arbitrary string as Weft's own state is not something
		// to do on their behalf.
		inheritedTheme = found === "dark" || found === "light" ? found : null;
	};

	resolve();

	// A host may toggle its own theme at runtime; the filter keeps this cheap
	// even though the subtree is the whole document.
	const observer = new MutationObserver(resolve);
	observer.observe(document.documentElement, {
		subtree: true,
		attributes: true,
		attributeFilter: ["data-theme"],
	});
	return () => observer.disconnect();
});

// The mirrored scheme picks which half of the pair renders. An unthemed host
// gets the light half when there is one — host pages are usually light, and
// the pre-conversion base palette was light for the same reason. A scheme the
// pair cannot serve clamps to the half that exists.
let activeStyle = $derived.by(() => {
	const scheme = inheritedTheme ?? (stylePair.light ? "light" : "dark");
	return stylePair[scheme as "dark" | "light"] ?? stylePair.light ?? stylePair.dark;
});

function handleNavigate(id: string, hash?: string) {
	onnavigate?.(id, hash);
}
</script>

<!--
	The reader, and nothing around it: no header, no document tree, no search
	palette, and no window-level key handler. A host that already has those would
	otherwise get a second set fighting its own.

	`theme.init()` is deliberately absent too. It writes `data-theme` onto
	documentElement, which is correct for an app that is the whole page and wrong
	for one panel inside someone else's — the host sets the attribute on this
	container if it wants Weft's dark scheme, or leaves it and inherits.

	The `data-theme` below is that inherited value, resolved and mirrored here so
	the cascade sees it on our own element rather than having to pick between two
	ancestors it cannot rank.
-->
<div
	class="weft-scope weft-doc"
	data-theme={inheritedTheme ?? undefined}
	data-nb-style={activeStyle}
	bind:this={root}
>
	{#if currentNode}
		<div class="doc" class:with-sidebar={linkedItems}>
			<main class="reader">
				<DocView
					nodeId={currentNode.id}
					nodeType={currentNode.type}
					{anchor}
					edges={manifest.edges}
					onnavigate={handleNavigate}
					{remarkPlugins}
					{rehypePlugins}
					{extendSchema}
				/>
			</main>

			{#if linkedItems}
				<aside class="linked">
					<LinkedItems nodeId={currentNode.id} {manifest} onnavigate={handleNavigate} />
				</aside>
			{/if}
		</div>
	{:else}
		<p class="missing">No document with id “{nodeId}”.</p>
	{/if}
</div>

<style>
	.doc {
		display: grid;
		grid-template-columns: 1fr;
		gap: 24px;
	}
	.doc.with-sidebar {
		grid-template-columns: 1fr var(--w-rhs-width, 260px);
	}
	.reader {
		min-width: 0;
	}
	.linked {
		min-width: 0;
	}
	.missing {
		color: var(--w-text-secondary);
		font-style: italic;
	}
</style>
