import type { WeftClient } from "$lib/client.js";
import type { RenderOptions } from "$lib/markdown.js";
import type { Manifest } from "@weft/core/browser";
import { mount, unmount } from "svelte";
import App from "./App.svelte";
import DocMountRoot from "./DocMountRoot.svelte";
import { createDocState } from "./doc-state.svelte.js";

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
}

/** A mounted reader. `update` re-points it; `destroy` removes it. */
export interface DocMount {
	update(state: Partial<DocMountState>): void;
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
 * The custom properties it consumes are the integration surface, and they are
 * documented rather than merely discoverable: `--color-bg`,
 * `--color-bg-secondary`, `--color-bg-elevated`, `--color-border`,
 * `--color-border-subtle`, `--color-text`, `--color-text-secondary`,
 * `--color-link`, `--color-accent`, `--color-accent-subtle`, `--font-sans`,
 * `--font-mono`, `--font-heading`, and the `--code-*` syntax tokens.
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
			state,
		},
	});

	return {
		update(next) {
			if (next.nodeId !== undefined) state.nodeId = next.nodeId;
			if ("anchor" in next) state.anchor = next.anchor;
		},
		destroy: () => unmount(app),
	};
}
