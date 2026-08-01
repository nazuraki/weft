import { readFileSync } from "node:fs";
import MiniSearch from "minisearch";
import type { Manifest, SearchResult } from "./types.js";

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
			fields: ["title", "content", "anchors"],
			storeFields: ["title"],
			searchOptions: {
				boost: { title: 3, anchors: 2, content: 1 },
				fuzzy: 0.2,
				prefix: true,
			},
		});
	}

	/**
	 * Build the search index from a manifest. `resolvePath` maps a node id to an
	 * absolute file path — a function rather than a directory, since node ids may
	 * span several docs roots.
	 */
	build(manifest: Manifest, resolvePath: (nodeId: string) => string | undefined): void {
		this.index.removeAll();

		// Artifacts are excluded outright. Reading a PDF as UTF-8 does not throw —
		// it yields a lossy decode — so the catch below would never fire and the
		// index would fill with binary noise that matches queries by accident.
		const searchable = manifest.nodes.filter((node) => node.type !== "artifact");

		const docs: SearchDoc[] = searchable.map((node) => {
			let content = "";
			const path = resolvePath(node.id);
			try {
				if (path) content = readFileSync(path, "utf-8");
			} catch {
				// File may not exist or be unreadable
			}

			return {
				id: node.id,
				title: node.title,
				content,
				// Index the heading text alongside the slug: a reader searches for
				// "Data Flow", not "data-flow".
				anchors: node.anchors.map((a) => `${a.slug} ${a.text}`).join(" "),
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
			match: r.match,
		}));
	}
}
