import { createHash } from "node:crypto";

/** Characters of the hex digest kept. 64 bits is far more than a docs set needs to avoid collisions. */
const HASH_LENGTH = 16;

/**
 * Strip the platform noise that would otherwise make identical content hash
 * differently in two checkouts.
 *
 * Git does not preserve line endings across platforms any more than it
 * preserves modification times, so hashing raw bytes would make a document
 * look changed purely because CI checked it out with LF and a Windows working
 * tree has CRLF — meaningless in exactly the environment these checks run in.
 * A leading BOM is dropped for the same reason.
 */
export function normalizeContent(content: string): string {
	return content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

/**
 * Content hash of a document, over its normalized full text including any
 * frontmatter.
 *
 * Reproducible outside Weft, which matters for a build tool that wants to
 * declare what it generated rather than have Weft recompute it: strip a leading
 * BOM, convert CRLF to LF, take SHA-256, keep the first 16 hex characters.
 */
export function hashContent(content: string): string {
	return createHash("sha256")
		.update(normalizeContent(content), "utf8")
		.digest("hex")
		.slice(0, HASH_LENGTH);
}

/**
 * Content hash of a file Weft cannot read as text, over its exact bytes.
 *
 * Same algorithm as `hashContent` minus the normalizing, because normalizing is
 * a text operation: a PDF holds byte sequences that look like CRLF and are not
 * line endings, and rewriting them would hash something the file never was.
 *
 * The two recipes share a field on the node but are never compared with each
 * other — a document's hash is only ever matched against another document's.
 */
export function hashBytes(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex").slice(0, HASH_LENGTH);
}

/**
 * Number of lines of text, counting the way an editor and `wc -l` agree on: a
 * trailing newline terminates the last line rather than starting an empty one.
 */
export function countLines(content: string): number {
	const normalized = normalizeContent(content);
	if (!normalized) return 0;
	const lines = normalized.split("\n");
	if (lines[lines.length - 1] === "") lines.pop();
	return lines.length;
}
