import { describe, it, expect } from 'vitest';
import { extractSidecarLinks } from '../sidecar.js';

const DOCS_DIR = '/project/docs';

describe('extractSidecarLinks', () => {
	it('extracts links from sidecar YAML', () => {
		const content = `
links:
  - anchor: "#data-flow"
    target: api.yaml#/paths/users/get
    type: references
    label: User API
`;
		const edges = extractSidecarLinks(
			content,
			'/project/docs/architecture.md.weft',
			DOCS_DIR
		);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			from: { node: 'architecture.md', anchor: '#data-flow' },
			to: { node: 'api.yaml', anchor: '#/paths/users/get' },
			type: 'references',
			label: 'User API'
		});
	});

	it('returns empty for no links', () => {
		expect(extractSidecarLinks('', '/project/docs/a.md.weft', DOCS_DIR)).toEqual([]);
	});

	it('defaults type to references', () => {
		const content = `
links:
  - target: other.md
`;
		const edges = extractSidecarLinks(content, '/project/docs/a.md.weft', DOCS_DIR);
		expect(edges[0].type).toBe('references');
	});
});
