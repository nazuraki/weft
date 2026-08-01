import { type Document, isMap, parseDocument } from "yaml";
import { scalarText } from "./scalar-source.js";

export interface Frontmatter {
	title?: string;
	theme?: "light" | "dark";
	description?: string;
	ogImage?: string;
	/** Document version, always a string — see `documentVersion`. */
	version?: string;
	[key: string]: unknown;
}

/** Read `version` exactly as it was written — see `scalarText`. */
function documentVersion(doc: Document): string | undefined {
	const contents = doc.contents;
	if (!isMap(contents)) return undefined;

	return scalarText(contents.get("version", true));
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
