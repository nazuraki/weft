import { mount, unmount } from "svelte";
import App from "./App.svelte";

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
