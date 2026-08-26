import type { Anchor, WeftConfig } from "../types.js";
import { extractMarkdownAnchors, extractMarkdownTitle } from "./markdown.js";
import { extractOpenApiAnchors, extractOpenApiTitle } from "./openapi.js";

export type DocType = "markdown" | "openapi";

/** Built-in extension-to-doc-type mapping. Answers "how do I parse this if handed it" — see `INDEXED_EXTENSIONS` below for "which files do I go looking for," a narrower, separate question. */
export const EXTENSION_MAP: Record<string, DocType> = {
	".md": "markdown",
	".markdown": "markdown",
	".yaml": "openapi",
	".yml": "openapi",
	".json": "openapi",
};

/**
 * Merge the built-in map with a project's `extensions` config. Takes the
 * config's extensions as plain data rather than a `WeftConfig`, so this module
 * stays free of any config-loading dependency; callers resolve `config.extensions`
 * themselves.
 */
export function resolveExtensionMap(extensions?: Record<string, DocType>): Record<string, DocType> {
	return { ...EXTENSION_MAP, ...extensions };
}

export function getDocType(
	filePath: string,
	extensionMap: Record<string, DocType> = EXTENSION_MAP
): DocType | undefined {
	const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
	return extensionMap[ext];
}

/**
 * File extensions the indexer turns into nodes.
 *
 * Shared with validation and freshness so none of them can drift: a check
 * that an edge resolves has to know which link targets were ever eligible to
 * become nodes, and the freshness baseline has to glob the same set the
 * indexer does. Note this is narrower than `getDocType`, which also maps
 * `.json`. A project can extend this set at runtime via `extensions` (see
 * `resolveIndexedExtensions`), but the defaults here are deliberate and are
 * never derived from `EXTENSION_MAP` — indexing `.json` by default, say,
 * would turn today's correctly-ignored links to a missing `./schema.json`
 * into `edge-target-missing` errors.
 */
export const INDEXED_EXTENSIONS = ["md", "markdown", "yaml", "yml"] as const;

/** The extensions (no leading dot) the indexer scans for: the defaults plus anything `config.extensions` added. */
export function resolveIndexedExtensions(config: WeftConfig): string[] {
	const configured = config.extensions
		? Object.keys(config.extensions).map((ext) => ext.slice(1).toLowerCase())
		: [];
	return [...INDEXED_EXTENSIONS, ...configured];
}

/** True when a node id names a file the indexer would have turned into a node. */
export function isIndexedPath(
	path: string,
	indexedExtensions: readonly string[] = INDEXED_EXTENSIONS
): boolean {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return indexedExtensions.includes(ext);
}

export function extractAnchors(content: string, docType: DocType): Anchor[] {
	switch (docType) {
		case "markdown":
			return extractMarkdownAnchors(content);
		case "openapi":
			return extractOpenApiAnchors(content);
	}
}

export function extractTitle(content: string, docType: DocType): string | undefined {
	switch (docType) {
		case "markdown":
			return extractMarkdownTitle(content);
		case "openapi":
			return extractOpenApiTitle(content);
	}
}

export { extractMarkdownAnchors, extractMarkdownTitle } from "./markdown.js";
export { extractOpenApiAnchors, extractOpenApiTitle } from "./openapi.js";
