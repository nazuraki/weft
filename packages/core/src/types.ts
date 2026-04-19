export interface WeftConfig {
	rootDir: string;
	docsDir: string;
	entryPoint: string;
	ignore: string[];
	/** Default theme when no user preference is saved. Falls back to system preference if unset. */
	defaultTheme?: "light" | "dark";
	/** Site name used in og:site_name and title fallbacks. */
	siteTitle?: string;
	/** Canonical base URL (e.g. https://docs.example.com) — used to build absolute og:image URLs. */
	siteUrl?: string;
	/** Default og:image path (relative to project root or absolute URL). */
	ogImage?: string;
	/** Layout mode for the UI. "reader" hides the linked-items sidebar. Defaults to "default". */
	layout?: "reader" | "default";
	/** Explicit document order for the LHN. Unlisted docs appear after in alpha order unless docOrderStrict is true. */
	docOrder?: string[];
	/** When true, only docs listed in docOrder appear in the LHN. Default false. */
	docOrderStrict?: boolean;
}

export interface WeftNode {
	id: string;
	type: "markdown" | "openapi";
	title: string;
	anchors: string[];
	theme?: "light" | "dark";
	description?: string;
	ogImage?: string;
}

export interface LinkRef {
	node: string;
	anchor?: string;
}

export interface WeftEdge {
	from: LinkRef;
	to: LinkRef;
	type: string;
	label?: string;
}

export interface Manifest {
	version: number;
	nodes: WeftNode[];
	edges: WeftEdge[];
}

export interface SearchResult {
	id: string;
	title: string;
	anchor?: string;
	score: number;
	match: Record<string, string[]>;
}
