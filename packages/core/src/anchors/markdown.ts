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

/** Extract heading anchors from Markdown content using GitHub-style slug algorithm. */
export function extractMarkdownAnchors(content: string): string[] {
	const anchors: string[] = [];
	const slugCounts = new Map<string, number>();

	for (const line of toLines(content)) {
		const match = line.match(/^(#{1,6})\s+(.+)$/);
		if (!match) continue;

		const slug = githubSlug(match[2]);
		const count = slugCounts.get(slug) ?? 0;
		slugCounts.set(slug, count + 1);

		anchors.push(count === 0 ? `#${slug}` : `#${slug}-${count}`);
	}

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

/** GitHub-style heading slug: lowercase, strip non-alphanum (keep hyphens/spaces), collapse spaces to hyphens. */
function githubSlug(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}
