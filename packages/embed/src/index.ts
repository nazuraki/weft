import type { WeftClient } from "$lib/client.js";
import type { RenderOptions } from "$lib/markdown.js";
import { assertServableStyles } from "$lib/styles.js";
import type { Manifest, StyleConfig } from "@weft/core/browser";
import { mount, unmount } from "svelte";
import App from "./App.svelte";
import DocMountRoot from "./DocMountRoot.svelte";
import { createDocState } from "./doc-state.svelte.js";

// Every ui-std-lib theme, folded into dist/weft.css. Safe in a host page:
// each rule is guarded by data-nb-style, which only Weft's own containers
// carry.
import "@nazuraki/styles/all";

export type { WeftClient } from "$lib/client.js";

export interface EmbedConfig {
	/** GitHub repo in "owner/repo" format. Required unless baseUrl is set. */
	repo?: string;
	/** Branch to read files from. Defaults to "main". */
	branch?: string;
	/**
	 * Path to the weft manifest JSON within the repo.
	 * Defaults to "docs/.weft/manifest.json".
	 */
	manifestPath?: string;
	/** Personal access token for private GitHub repos. */
	token?: string;
	/**
	 * Base URL for raw file access — alternative to GitHub mode.
	 * All file paths are appended to this URL.
	 * Example: "https://example.com/docs"
	 */
	baseUrl?: string;
	/**
	 * Render passes this host contributes, for conventions Weft should not know.
	 *
	 * A corpus with a house vocabulary — findings, severities, status ledgers —
	 * expresses it as a plugin it owns and versions, rather than forking the
	 * renderer or going without. Whatever they emit is sanitized like everything
	 * else, so `extendSchema` has to widen the allowlist to match.
	 */
	remarkPlugins?: RenderOptions["remarkPlugins"];
	rehypePlugins?: RenderOptions["rehypePlugins"];
	extendSchema?: RenderOptions["extendSchema"];
	/**
	 * ui-std-lib style: one theme name, or a {dark, light} pair the embed's
	 * toggle switches between. Defaults to dark=luminous-precision /
	 * light=summer-cloud. Applied to the mount's own container — the host's
	 * page keeps its own styling.
	 */
	style?: StyleConfig;
	/**
	 * Base URL serving ui-std-lib theme CSS for names newer than the bundled
	 * set (e.g. a jsDelivr styles/ path). Costs a stylesheet <link> injected
	 * into the host's <head> — theme CSS cannot be scoped to a shadow of the
	 * mount, only guarded by the attribute.
	 */
	styleUrl?: string;
}

/**
 * Mount a Weft documentation browser into a DOM element.
 *
 * @param target - A CSS selector string or HTMLElement to mount into.
 * @param config - Source configuration (GitHub repo or base URL).
 * @returns A function that unmounts the app.
 *
 * @example
 * // GitHub repo
 * import { mount } from '@weft/embed';
 * const unmount = mount('#weft-root', { repo: 'acme/docs', branch: 'main' });
 *
 * @example
 * // Generic base URL
 * import { mount } from '@weft/embed';
 * const unmount = mount('#weft-root', { baseUrl: 'https://example.com/docs' });
 */
export function mountWeft(target: string | HTMLElement, config: EmbedConfig): () => void {
	if (!config.repo && !config.baseUrl) {
		throw new Error("Weft: either `repo` or `baseUrl` must be provided");
	}

	const container =
		typeof target === "string" ? (document.querySelector(target) as HTMLElement | null) : target;

	if (!container) {
		throw new Error(`Weft: container not found: ${target}`);
	}
	assertServableStyles(config.style, config.styleUrl);

	const app = mount(App, { target: container, props: { config } });
	return () => unmount(app);
}

/** What a `mountDoc` host may change after mounting. */
export interface DocMountState {
	nodeId: string;
	anchor?: string;
}

export interface DocMountOptions extends DocMountState {
	/**
	 * How documents and search are fetched.
	 *
	 * Supplied by the host rather than configured, because a host with its own
	 * document endpoints and its own search backend should not have to re-serve
	 * files at a URL shape Weft picked, nor ship a second search index to
	 * duplicate one it already has. It is two methods:
	 * `fetchDoc(id)` and `search(query)`.
	 */
	client: WeftClient;
	/** The graph. The host loads it; Weft does not decide where it lives. */
	manifest: Manifest;
	/** Show the linked-items sidebar. Off unless asked for. */
	linkedItems?: boolean;
	/**
	 * Called when a link inside the document is followed.
	 *
	 * The mount does not navigate itself. The host owns its URL and history, and
	 * calls `update` if it decides to show the new document.
	 */
	onNavigate?: (nodeId: string, anchor?: string) => void;
	remarkPlugins?: RenderOptions["remarkPlugins"];
	rehypePlugins?: RenderOptions["rehypePlugins"];
	extendSchema?: RenderOptions["extendSchema"];
	/**
	 * ui-std-lib style for the mounted reader. A pair follows the host's
	 * nearest-ancestor `data-theme` (the mirroring contract); a single name is
	 * fixed. Defaults to dark=luminous-precision / light=summer-cloud.
	 */
	style?: StyleConfig;
	/** As on EmbedConfig: where to load a non-bundled style name from. */
	styleUrl?: string;
}

/** A mounted reader. `update` re-points it; `destroy` removes it. */
export interface DocMount {
	/**
	 * Show a different document, or a different anchor in this one.
	 *
	 * Takes the whole state rather than a patch, deliberately. A partial needs a
	 * rule for what an omitted `anchor` means, and every answer is wrong
	 * somewhere: leave it and a re-point carries the old anchor into the new
	 * document — which silently scrolls to the wrong place whenever both share a
	 * slug, and `#overview` or `#configuration` appear in several documents of
	 * any real corpus. Clear it and a refresh loses the reader's position.
	 *
	 * Passing the state whole removes the question. Omitting the anchor clears it
	 * because you did not pass one, which is what the type already says.
	 */
	update(state: DocMountState): void;
	destroy(): void;
}

/**
 * Mount the reader on its own, without Weft's chrome.
 *
 * `mountWeft` gives a host the whole product — header, document tree, search,
 * its own theme handling and a window key handler. A host that already has all
 * of those wants the part it does not: the rendered document and the graph
 * around it. This is that part.
 *
 * What it deliberately does not do: navigate itself, set a theme on the page,
 * or apply global styles. Everything it renders sits under `.weft-scope`, so
 * the tokens resolve from its own container and a host's page keeps its own
 * box model and fonts. Set `data-theme="dark"` on the container to pick a
 * scheme, or leave it and Weft inherits whatever the host already decided.
 *
 * Theme it by setting `--weft-*` custom properties on the container or any
 * ancestor; Weft reads those and never declares them, so a host value always
 * wins. The full list lives in `docs/usage.md`'s theming contract rather than
 * here — two hand-maintained copies of twenty-odd names had already drifted
 * apart by the time this comment was first written.
 *
 * @example
 * const doc = Weft.mountDoc('#host', {
 *   client, manifest,
 *   nodeId: 'guide.md',
 *   linkedItems: true,
 *   onNavigate: (id, anchor) => router.go(id, anchor),
 * });
 * doc.update({ nodeId: 'api.md' });
 */
export function mountDoc(target: string | HTMLElement, options: DocMountOptions): DocMount {
	const container =
		typeof target === "string" ? (document.querySelector(target) as HTMLElement | null) : target;

	if (!container) {
		throw new Error(`Weft: container not found: ${target}`);
	}
	if (!options.client) {
		throw new Error("Weft: mountDoc needs a `client` — see WeftClient");
	}
	if (!options.manifest) {
		throw new Error("Weft: mountDoc needs a `manifest`");
	}
	assertServableStyles(options.style, options.styleUrl);

	const state = createDocState({ nodeId: options.nodeId, anchor: options.anchor });

	const app = mount(DocMountRoot, {
		target: container,
		props: {
			client: options.client,
			manifest: options.manifest,
			linkedItems: options.linkedItems,
			onnavigate: options.onNavigate,
			remarkPlugins: options.remarkPlugins,
			rehypePlugins: options.rehypePlugins,
			extendSchema: options.extendSchema,
			style: options.style,
			state,
		},
	});

	return {
		update(next) {
			state.nodeId = next.nodeId;
			state.anchor = next.anchor;
		},
		destroy: () => unmount(app),
	};
}
