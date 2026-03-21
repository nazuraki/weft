import MiniSearch from 'minisearch';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Manifest, SearchResult } from './types.js';

interface SearchDoc {
	id: string;
	title: string;
	content: string;
	anchors: string;
}

export class SearchIndex {
	private index: MiniSearch<SearchDoc>;

	constructor() {
		this.index = new MiniSearch<SearchDoc>({
			fields: ['title', 'content', 'anchors'],
			storeFields: ['title'],
			searchOptions: {
				boost: { title: 3, anchors: 2, content: 1 },
				fuzzy: 0.2,
				prefix: true
			}
		});
	}

	/** Build the search index from a manifest and the docs directory. */
	build(manifest: Manifest, docsDir: string): void {
		this.index.removeAll();

		const docs: SearchDoc[] = manifest.nodes.map((node) => {
			let content = '';
			try {
				content = readFileSync(resolve(docsDir, node.id), 'utf-8');
			} catch {
				// File may not exist or be unreadable
			}

			return {
				id: node.id,
				title: node.title,
				content,
				anchors: node.anchors.join(' ')
			};
		});

		this.index.addAll(docs);
	}

	/** Search the index. */
	search(query: string): SearchResult[] {
		const results = this.index.search(query);
		return results.map((r) => ({
			id: r.id,
			title: (r as unknown as { title: string }).title,
			score: r.score,
			match: r.match
		}));
	}
}
