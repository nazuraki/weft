import type { SearchResult } from "@weft/core";

export const WEFT_CLIENT_KEY = "weft:client";

export interface WeftClient {
	fetchDoc(id: string): Promise<string>;
	search(query: string): Promise<SearchResult[]>;
}
