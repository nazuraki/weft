/** A single product's docs root in a multi-project (monorepo) setup. */
export interface WeftProject {
	/** Display name, shown as a group header in the left-hand nav. */
	name: string;
	/** Directory to scan for this project's documents, relative to project root. */
	docsDir: string;
	/** Id/URL namespace for this project's documents. Defaults to a kebab-cased `name`. */
	slug?: string;
}

/** A project as recorded in a manifest — always has its slug resolved. */
export interface WeftProjectRef {
	name: string;
	slug: string;
	docsDir: string;
}

export interface WeftConfig {
	rootDir: string;
	docsDir: string;
	entryPoint: string;
	ignore: string[];
	/**
	 * Multiple docs roots, one per product. When set, node ids are namespaced by
	 * project slug (`alpha/api.md`) and `docsDir` is ignored.
	 */
	projects?: WeftProject[];
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
	/** Explicit document order for the LHN. Unlisted docs appear after, in alpha order. */
	docOrder?: string[];
	/** When true, only docs listed in docOrder appear in the LHN. Default false. */
	docOrderStrict?: boolean;
	/** Per-rule severity for the validation stage. "off" disables the rule entirely. */
	rules?: Record<string, RuleSeverity>;
}

/** How serious a diagnostic is. Only "error" fails `weft check`. */
export type Severity = "error" | "warn" | "info";

/** A rule's configured severity. "off" means the rule does not run. */
export type RuleSeverity = Severity | "off";

export interface WeftNode {
	id: string;
	type: "markdown" | "openapi";
	title: string;
	anchors: string[];
	/** Slug of the owning project. Absent in single-project mode. */
	project?: string;
	theme?: "light" | "dark";
	description?: string;
	ogImage?: string;
	/**
	 * Excluded from the left-hand nav by `docOrderStrict`. Still a full graph
	 * node: reachable by link, search and traversal, and a valid edge endpoint.
	 */
	hiddenFromNav?: boolean;
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

/** Presentation config carried in the manifest so the UI needs no config access. */
export interface SiteConfig {
	defaultTheme?: "light" | "dark";
	layout?: "reader" | "default";
	siteTitle?: string;
	siteUrl?: string;
	ogImage?: string;
}

export interface Manifest {
	version: number;
	nodes: WeftNode[];
	edges: WeftEdge[];
	/** Configured projects. Present only in multi-project mode. */
	projects?: WeftProjectRef[];
	/** Presentation config for the UI. Absent when nothing is configured. */
	site?: SiteConfig;
}

/** A manifest scoped to one project, written to `<project docsDir>/.weft/manifest.json`. */
export interface ProjectManifest {
	version: number;
	project: WeftProjectRef;
	nodes: WeftNode[];
	/** Edges originating in this project. Targets may point at other projects. */
	edges: WeftEdge[];
}

/** Index of the per-project manifests, written to `<rootDir>/.weft/projects.json`. */
export interface ProjectsIndex {
	version: number;
	projects: (WeftProjectRef & {
		/** Path to this project's manifest, relative to the project root. */
		manifest: string;
	})[];
	/** Path to the merged manifest, relative to the project root. */
	manifest: string;
}

export interface SearchResult {
	id: string;
	title: string;
	anchor?: string;
	score: number;
	match: Record<string, string[]>;
}
