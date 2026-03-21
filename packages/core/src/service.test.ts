import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WeftService } from './service.js';
import type { WeftConfig } from './types.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const FIXTURES_DIR = resolve(__dirname, '__fixtures__');

function createService(): WeftService {
	const config: WeftConfig = {
		rootDir: FIXTURES_DIR,
		docsDir: 'docs',
		entryPoint: 'docs/README.md',
		ignore: []
	};
	return new WeftService(config);
}

describe('WeftService', () => {
	it('builds and returns manifest', async () => {
		const service = createService();
		const manifest = await service.getManifest();

		expect(manifest.version).toBe(1);
		expect(manifest.nodes.length).toBeGreaterThan(0);
	});

	it('reads document content', async () => {
		const service = createService();
		const content = service.read('README.md');

		expect(content).toContain('Project Documentation');
	});

	it('searches documents', async () => {
		const service = createService();
		const results = await service.search('architecture');

		expect(results.length).toBeGreaterThan(0);
		expect(results[0].id).toBeDefined();
	});

	it('traverses outgoing edges', async () => {
		const service = createService();
		const edges = await service.traverse('README.md', 'outgoing');

		expect(edges.length).toBeGreaterThan(0);
		expect(edges.every((e) => e.from.node === 'README.md')).toBe(true);
	});

	it('traverses incoming edges', async () => {
		const service = createService();
		const edges = await service.traverse('architecture.md', 'incoming');

		expect(edges.length).toBeGreaterThan(0);
		expect(edges.every((e) => e.to.node === 'architecture.md')).toBe(true);
	});
});
