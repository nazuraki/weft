import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { resolve, relative, dirname } from 'node:path';
import type { WeftEdge, LinkRef } from '../types.js';

interface MdLink {
	label: string;
	url: string;
}

/**
 * Extract graph edges from Markdown content.
 * A link is a graph edge if it targets a file within the docs directory.
 */
export function extractMarkdownLinks(
	content: string,
	filePath: string,
	docsDir: string
): WeftEdge[] {
	const tree = unified().use(remarkParse).parse(content);
	const links: MdLink[] = [];

	visit(tree, 'link', (node: { url: string; children: Array<{ value?: string }> }) => {
		// Skip external links and anchors-only
		if (node.url.startsWith('http://') || node.url.startsWith('https://') || node.url.startsWith('#')) {
			return;
		}
		const label = node.children
			.map((c) => c.value ?? '')
			.join('')
			.trim();
		links.push({ label, url: node.url });
	});

	const fileDir = dirname(filePath);
	const edges: WeftEdge[] = [];

	for (const link of links) {
		const [pathPart, anchor] = link.url.split('#');
		if (!pathPart) continue;

		const absTarget = resolve(fileDir, pathPart);
		const relTarget = relative(docsDir, absTarget);

		// Only treat as graph edge if target is inside docsDir
		if (relTarget.startsWith('..')) continue;

		const fromNode = relative(docsDir, filePath);

		const from: LinkRef = { node: fromNode };
		const to: LinkRef = { node: relTarget };
		if (anchor) to.anchor = `#${anchor}`;

		edges.push({
			from,
			to,
			type: 'references',
			label: link.label || undefined
		});
	}

	return edges;
}
