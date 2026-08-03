import type { Anchor } from "../types.js";
import { extractMarkdownAnchors, extractMarkdownTitle } from "./markdown.js";
import { extractOpenApiAnchors, extractOpenApiTitle } from "./openapi.js";

export type DocType = "markdown" | "openapi";

/** Built-in extension-to-doc-type mapping. Answers "how do I parse this if handed it" — see `INDEXED_EXTENSIONS` in `manifest.ts` for "which files do I go looking for," a narrower, separate question. */
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
