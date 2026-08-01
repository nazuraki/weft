import { type Document, isMap, isScalar, parseDocument } from "yaml";

export interface Frontmatter {
	title?: string;
	theme?: "light" | "dark";
	description?: string;
	ogImage?: string;
	/** Document version, always a string — see `documentVersion`. */
	version?: string;
	[key: string]: unknown;
}

/**
 * Read `version` exactly as it was written.
 *
 * YAML parses an unquoted `2.10` as the number 2.1, so a document that says
 * 2.10 and a link asserting "2.10" would disagree over a difference that exists
 * only in the parse. The scalar keeps its source text, so prefer that over the
 * parsed value and leave quoting up to the author.
 */
function documentVersion(doc: Document): string | undefined {
	const contents = doc.contents;
	if (!isMap(contents)) return undefined;

	const node = contents.get("version", true);
	if (!isScalar(node) || node.value === null || node.value === undefined) return undefined;

	const source = typeof node.source === "string" ? node.source.trim() : "";
	return source || String(node.value);
}

/** Strip and parse YAML frontmatter from markdown content. */
export function parseFrontmatter(content: string): { data: Frontmatter; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { data: {}, body: content };

	const doc = parseDocument(match[1]);
	const parsed = (doc.toJS() ?? {}) as Frontmatter;
	// Overwritten rather than taken as parsed: `version:` with nothing after it
	// yields null, and a consumer typed against `string | undefined` would carry
	// that straight into the manifest.
	const data: Frontmatter = { ...parsed, version: documentVersion(doc) };

	const body = content.slice(match[0].length);
	return { data, body };
}
