import { describe, it, expect } from 'vitest';
import { extractMarkdownLinks } from '../markdown.js';

const DOCS_DIR = '/project/docs';

describe('extractMarkdownLinks', () => {
	it('extracts relative links within docs', () => {
		const content = 'See [Architecture](architecture.md#data-flow) for details.\n';
		const edges = extractMarkdownLinks(content, '/project/docs/README.md', DOCS_DIR);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			from: { node: 'README.md' },
			to: { node: 'architecture.md', anchor: '#data-flow' },
			type: 'references',
			label: 'Architecture'
		});
	});

	it('ignores external links', () => {
		const content = '[Google](https://google.com)\n';
		const edges = extractMarkdownLinks(content, '/project/docs/README.md', DOCS_DIR);
		expect(edges).toHaveLength(0);
	});

	it('ignores anchor-only links', () => {
		const content = '[Jump](#section)\n';
		const edges = extractMarkdownLinks(content, '/project/docs/README.md', DOCS_DIR);
		expect(edges).toHaveLength(0);
	});

	it('ignores links outside docs directory', () => {
		const content = '[Src](../../src/main.ts)\n';
		const edges = extractMarkdownLinks(content, '/project/docs/README.md', DOCS_DIR);
		expect(edges).toHaveLength(0);
	});

	it('handles links without anchors', () => {
		const content = '[API](api.yaml)\n';
		const edges = extractMarkdownLinks(content, '/project/docs/README.md', DOCS_DIR);

		expect(edges).toHaveLength(1);
		expect(edges[0].to).toEqual({ node: 'api.yaml' });
	});

	it('handles subdirectory links', () => {
		const content = '[Schema](schemas/user.md)\n';
		const edges = extractMarkdownLinks(content, '/project/docs/README.md', DOCS_DIR);

		expect(edges).toHaveLength(1);
		expect(edges[0].to.node).toBe('schemas/user.md');
	});
});
