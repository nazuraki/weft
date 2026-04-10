import type { WeftClient } from "$lib/client.js";
import type { Manifest, SearchResult } from "@weft/core/browser";
import MiniSearch from "minisearch";
import type { EmbedConfig } from "./index.js";

interface SearchDoc {
	id: string;
	title: string;
	anchors: string;
}

export class GitHubClient implements WeftClient {
	private config: EmbedConfig;
	private index: MiniSearch<SearchDoc>;

	constructor(config: EmbedConfig) {
		this.config = config;
		this.index = new MiniSearch<SearchDoc>({
			fields: ["title", "anchors"],
			storeFields: ["title"],
			searchOptions: {
				boost: { title: 3, anchors: 2 },
				fuzzy: 0.2,
				prefix: true,
			},
		});
	}

	buildIndex(manifest: Manifest): void {
		const docs = manifest.nodes.map((node) => ({
			id: node.id,
			title: node.title,
			anchors: node.anchors.join(" "),
		}));
		this.index.addAll(docs);
	}

	rawUrl(filePath: string): string {
		if (this.config.baseUrl) {
			const base = this.config.baseUrl.replace(/\/$/, "");
			return `${base}/${filePath}`;
		}
		const branch = this.config.branch ?? "main";
		return `https://raw.githubusercontent.com/${this.config.repo}/${branch}/${filePath}`;
	}

	private fetchHeaders(): Record<string, string> {
		if (this.config.token) {
			return { Authorization: `token ${this.config.token}` };
		}
		return {};
	}

	async fetchDoc(id: string): Promise<string> {
		const res = await fetch(this.rawUrl(id), { headers: this.fetchHeaders() });
		if (!res.ok) throw new Error(`Failed to load (${res.status}): ${id}`);
		return res.text();
	}

	async search(query: string): Promise<SearchResult[]> {
		const results = this.index.search(query);
		return results.map((r) => ({
			id: r.id,
			title: (r as unknown as SearchDoc).title,
			score: r.score,
			match: r.match,
		}));
	}
}
