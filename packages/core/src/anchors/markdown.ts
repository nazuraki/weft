import GithubSlugger from "github-slugger";
import type { Anchor } from "../types.js";

/**
 * Split content into lines, tolerating CRLF.
 *
 * A trailing `\r` would otherwise survive into every line: `.` does not match
 * `\r` and `$` (no `m` flag) only matches at end of input, so the line patterns
 * below silently fail on any file checked out with Windows line endings.
 */
function toLines(content: string): string[] {
	return content.split(/\r?\n/);
}

/**
 * Extract heading anchors from Markdown content.
 *
 * Slugs come from `github-slugger`, the implementation GitHub's own rendering
 * uses, rather than an approximation of it: links are authored against how the
 * document renders on GitHub (DD-2), so GitHub's slugs are the correct ones.
 * The slugger also owns the `-1`, `-2` suffixes it appends to repeated slugs.
 */
export function extractMarkdownAnchors(content: string): Anchor[] {
	const anchors: Anchor[] = [];
	const slugger = new GithubSlugger();
	let fence: string | undefined;

	toLines(content).forEach((line, index) => {
		// A `#` opening a line inside a fenced block is code — a shell comment,
		// say — not a heading, and GitHub gives it no anchor.
		const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fenceMatch) {
			const marker = fenceMatch[1][0];
			if (!fence) fence = marker;
			else if (fence === marker) fence = undefined;
			return;
		}
		if (fence) return;

		const match = line.match(/^(#{1,6})\s+(.+)$/);
		if (!match) return;

		const text = match[2].trim();
		anchors.push({
			slug: `#${slugger.slug(text)}`,
			text,
			line: index + 1,
			level: match[1].length,
		});
	});

	return anchors;
}

/** Extract the first prose paragraph as a plain-text description. */
export function extractMarkdownDescription(content: string): string | undefined {
	for (const line of toLines(content)) {
		const trimmed = line.trim();
		if (
			!trimmed ||
			trimmed.startsWith("#") ||
			trimmed.startsWith(">") ||
			trimmed.startsWith("-") ||
			trimmed.startsWith("|")
		)
			continue;
		const plain = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "");
		if (plain.length > 20) return plain.slice(0, 200);
	}
	return undefined;
}

/** Extract the title (first H1) from Markdown content. */
export function extractMarkdownTitle(content: string): string | undefined {
	for (const line of toLines(content)) {
		const match = line.match(/^#\s+(.+)$/);
		if (match) return match[1].trim();
	}
	return undefined;
}
