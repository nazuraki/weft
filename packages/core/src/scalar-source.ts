import { isScalar } from "yaml";

/**
 * A YAML scalar's text exactly as it was written.
 *
 * YAML types unquoted scalars, and for the identifiers Weft carries around that
 * is a loss rather than a convenience: `2.10` becomes the number 2.1, and a
 * content hash whose sixteen hex characters happen to all be digits becomes an
 * integer with its leading zeros gone. Either way the value stops matching the
 * text the author wrote, and the mismatch exists only in the parse.
 *
 * The parser keeps each scalar's source text for exactly this reason, so prefer
 * it and leave quoting to the author's taste. Returns undefined for an absent or
 * empty value, which callers treat as "not declared".
 */
export function scalarText(node: unknown): string | undefined {
	if (!isScalar(node) || node.value === null || node.value === undefined) return undefined;

	const source = typeof node.source === "string" ? node.source.trim() : "";
	return source || String(node.value);
}
