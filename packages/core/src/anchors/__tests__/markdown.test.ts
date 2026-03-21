import { describe, it, expect } from 'vitest';
import { extractMarkdownAnchors, extractMarkdownTitle } from '../markdown.js';

describe('extractMarkdownAnchors', () => {
	it('extracts heading slugs', () => {
		const content = '# Title\n\n## Getting Started\n\n### API Reference\n';
		expect(extractMarkdownAnchors(content)).toEqual([
			'#title',
			'#getting-started',
			'#api-reference'
		]);
	});

	it('handles duplicate headings with suffix', () => {
		const content = '## Overview\n\n## Details\n\n## Overview\n';
		expect(extractMarkdownAnchors(content)).toEqual([
			'#overview',
			'#details',
			'#overview-1'
		]);
	});

	it('strips special characters', () => {
		const content = '## What is `weft`?\n';
		expect(extractMarkdownAnchors(content)).toEqual(['#what-is-weft']);
	});

	it('returns empty array for no headings', () => {
		expect(extractMarkdownAnchors('Just a paragraph.\n')).toEqual([]);
	});
});

describe('extractMarkdownTitle', () => {
	it('extracts the first H1', () => {
		expect(extractMarkdownTitle('# My Doc\n\n## Section')).toBe('My Doc');
	});

	it('returns undefined when no H1', () => {
		expect(extractMarkdownTitle('## Not a title\n')).toBeUndefined();
	});
});
