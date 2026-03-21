/** Extract heading anchors from Markdown content using GitHub-style slug algorithm. */
export function extractMarkdownAnchors(content: string): string[] {
	const anchors: string[] = [];
	const slugCounts = new Map<string, number>();

	for (const line of content.split('\n')) {
		const match = line.match(/^(#{1,6})\s+(.+)$/);
		if (!match) continue;

		const slug = githubSlug(match[2]);
		const count = slugCounts.get(slug) ?? 0;
		slugCounts.set(slug, count + 1);

		anchors.push(count === 0 ? `#${slug}` : `#${slug}-${count}`);
	}

	return anchors;
}

/** Extract the title (first H1) from Markdown content. */
export function extractMarkdownTitle(content: string): string | undefined {
	for (const line of content.split('\n')) {
		const match = line.match(/^#\s+(.+)$/);
		if (match) return match[1].trim();
	}
	return undefined;
}

/** GitHub-style heading slug: lowercase, strip non-alphanum (keep hyphens/spaces), collapse spaces to hyphens. */
function githubSlug(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}
