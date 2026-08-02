import type { Anchor } from "../types.js";
import { extractMarkdownAnchors, extractMarkdownTitle } from "./markdown.js";
import { extractOpenApiAnchors, extractOpenApiTitle } from "./openapi.js";

export type DocType = "markdown" | "openapi";

const EXTENSION_MAP: Record<string, DocType> = {
	".md": "markdown",
	".markdown": "markdown",
	".yaml": "openapi",
	".yml": "openapi",
	".json": "openapi",
};

export function getDocType(filePath: string): DocType | undefined {
	const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
	return EXTENSION_MAP[ext];
}

/**
 * File extensions the indexer turns into nodes.
 *
 * Shared with validation and freshness so none of them can drift: a check
 * that an edge resolves has to know which link targets were ever eligible to
 * become nodes, and the freshness baseline has to glob the same set the
 * indexer does. Narrower than `getDocType` above, which also maps `.json`.
 */
export const INDEXED_EXTENSIONS = ["md", "markdown", "yaml", "yml"] as const;

/** True when a node id names a file the indexer would have turned into a node. */
export function isIndexedPath(path: string): boolean {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return (INDEXED_EXTENSIONS as readonly string[]).includes(ext);
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
