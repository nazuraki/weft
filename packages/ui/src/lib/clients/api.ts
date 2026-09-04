import type { SearchResult } from "@lepid-labs/weft-core";
import type { WeftClient } from "../client.js";

/** Fetches data from the SvelteKit API routes — for use in the hosted app. */
export class ApiClient implements WeftClient {
	async fetchDoc(id: string): Promise<string> {
		const res = await fetch(`/api/doc/${id}`);
		if (!res.ok) throw new Error(`Failed to load: ${res.statusText}`);
		const data = await res.json();
		return data.content as string;
	}

	async search(query: string): Promise<SearchResult[]> {
		const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
		if (!res.ok) throw new Error("Search failed");
		return res.json() as Promise<SearchResult[]>;
	}
}
