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

/**
 * A linkable position within a document.
 *
 * `slug` is the only field an edge matches on — `line`, `level` and `text` exist
 * so a consumer can order, nest, jump to, or recognise an anchor. Notably they
 * let a renamed heading be told apart from a deleted one, which a bare slug
 * cannot express.
 */
export interface Anchor {
	/** URL fragment including the leading "#", exactly as `LinkRef.anchor` writes it. */
	slug: string;
	/** Source text the slug was derived from: the heading, or the operation id / schema name. */
	text: string;
	/** 1-based line in the source file. Absent for anchors with no line, such as OpenAPI. */
	line?: number;
	/** Heading level, 1-6. Absent for anchors that are not headings. */
	level?: number;
}

export interface WeftNode {
	id: string;
	type: "markdown" | "openapi";
	title: string;
	anchors: Anchor[];
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
	/**
	 * Hash of the document's content, for telling two copies apart and for
	 * noticing that a generated output no longer reflects its source.
	 *
	 * Optional because not every node is indexed from a file — a node declared
	 * by an external tool may arrive without one.
	 */
	contentHash?: string;
	/**
	 * Lines of text in the document, so a claim made about its length can be
	 * checked. Absent for nodes that have no lines, such as a binary artifact.
	 */
	lineCount?: number;
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
	/**
	 * The target is known not to exist yet. Writing a pointer to something you
	 * are about to create is normal practice, so validation reports these
	 * separately instead of as breakage — but still reports them, so a reference
	 * left pending stays visible and countable.
	 *
	 * Only sidecar links can declare this today; an inline Markdown link has
	 * nowhere to put it.
	 */
	pending?: boolean;
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
