import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './manifest.js';
import type { WeftConfig } from './types.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const FIXTURES_DIR = resolve(__dirname, '__fixtures__');

function fixtureConfig(): WeftConfig {
	return {
		rootDir: FIXTURES_DIR,
		docsDir: 'docs',
		entryPoint: 'docs/README.md',
		ignore: []
	};
}

describe('buildManifest', () => {
	it('discovers all doc nodes', async () => {
		const manifest = await buildManifest(fixtureConfig());

		const ids = manifest.nodes.map((n) => n.id).sort();
		expect(ids).toEqual(['README.md', 'api.yaml', 'architecture.md']);
	});

	it('extracts markdown anchors', async () => {
		const manifest = await buildManifest(fixtureConfig());
		const arch = manifest.nodes.find((n) => n.id === 'architecture.md');

		expect(arch?.anchors).toContain('#overview');
		expect(arch?.anchors).toContain('#data-flow');
		expect(arch?.anchors).toContain('#database-schema');
	});

	it('extracts openapi anchors', async () => {
		const manifest = await buildManifest(fixtureConfig());
		const api = manifest.nodes.find((n) => n.id === 'api.yaml');

		expect(api?.anchors).toContain('#listUsers');
		expect(api?.anchors).toContain('#/components/schemas/User');
	});

	it('extracts edges from markdown links', async () => {
		const manifest = await buildManifest(fixtureConfig());

		const readmeToArch = manifest.edges.filter(
			(e) => e.from.node === 'README.md' && e.to.node === 'architecture.md'
		);
		expect(readmeToArch.length).toBeGreaterThanOrEqual(1);

		const withAnchor = readmeToArch.find((e) => e.to.anchor === '#overview');
		expect(withAnchor).toBeDefined();
	});

	it('sets correct node types', async () => {
		const manifest = await buildManifest(fixtureConfig());

		expect(manifest.nodes.find((n) => n.id === 'README.md')?.type).toBe('markdown');
		expect(manifest.nodes.find((n) => n.id === 'api.yaml')?.type).toBe('openapi');
	});

	it('sets version to 1', async () => {
		const manifest = await buildManifest(fixtureConfig());
		expect(manifest.version).toBe(1);
	});
});
