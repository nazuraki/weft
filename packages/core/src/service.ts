import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import chokidar from 'chokidar';
import type { WeftConfig, Manifest, WeftEdge, SearchResult } from './types.js';
import { buildManifest } from './manifest.js';
import { SearchIndex } from './search.js';

export class WeftService {
	private config: WeftConfig;
	private manifest: Manifest | null = null;
	private searchIndex: SearchIndex;

	constructor(config: WeftConfig) {
		this.config = config;
		this.searchIndex = new SearchIndex();
	}

	/** Get the docs directory absolute path. */
	get docsDir(): string {
		return resolve(this.config.rootDir, this.config.docsDir);
	}

	/** Get the manifest output path. */
	get manifestPath(): string {
		return resolve(this.docsDir, '.weft', 'manifest.json');
	}

	/** Build or rebuild the manifest from the filesystem. */
	async rebuild(): Promise<Manifest> {
		this.manifest = await buildManifest(this.config);
		this.searchIndex.build(this.manifest, this.docsDir);
		return this.manifest;
	}

	/** Get the current manifest, building it if necessary. */
	async getManifest(): Promise<Manifest> {
		if (!this.manifest) {
			await this.rebuild();
		}
		return this.manifest!;
	}

	/** Write the manifest to disk. */
	async writeManifest(): Promise<string> {
		const manifest = await this.getManifest();
		const outPath = this.manifestPath;
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, JSON.stringify(manifest, null, 2));
		return outPath;
	}

	/** Read a document's content. */
	read(nodeId: string): string {
		const filePath = resolve(this.docsDir, nodeId);
		return readFileSync(filePath, 'utf-8');
	}

	/** Search the index. */
	async search(query: string): Promise<SearchResult[]> {
		await this.getManifest(); // Ensure index is built
		return this.searchIndex.search(query);
	}

	/** Traverse the graph: find edges connected to a node. */
	async traverse(
		nodeId: string,
		direction: 'outgoing' | 'incoming' | 'both' = 'both'
	): Promise<WeftEdge[]> {
		const manifest = await this.getManifest();
		return manifest.edges.filter((edge) => {
			if (direction === 'outgoing' || direction === 'both') {
				if (edge.from.node === nodeId) return true;
			}
			if (direction === 'incoming' || direction === 'both') {
				if (edge.to.node === nodeId) return true;
			}
			return false;
		});
	}

	/** Watch the docs directory for changes and rebuild on change. */
	watch(callback?: (manifest: Manifest) => void): () => void {
		const watcher = chokidar.watch(this.docsDir, {
			ignored: [
				/(^|[/\\])\../,       // dotfiles
				'**/.weft/**',         // manifest output
				...this.config.ignore
			],
			persistent: true,
			ignoreInitial: true
		});

		let debounceTimer: ReturnType<typeof setTimeout> | null = null;

		const onChangeDebounced = () => {
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(async () => {
				const manifest = await this.rebuild();
				callback?.(manifest);
			}, 200);
		};

		watcher.on('add', onChangeDebounced);
		watcher.on('change', onChangeDebounced);
		watcher.on('unlink', onChangeDebounced);

		return () => {
			watcher.close();
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	}
}
