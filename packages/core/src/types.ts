/**
 * A ui-std-lib style selection: one theme name, or a scheme pair the UI's
 * light/dark toggle switches between. Names are validated by the UI against
 * the installed @nazuraki/styles manifest (core stays dependency-free, and a
 * theme newer than the installed set is reachable via `styleUrl`).
 */
export type StyleConfig = string | { dark: string; light: string };

/** A single product's docs root in a multi-project (monorepo) setup. */
export interface WeftProject {
	/** Display name, shown as a group header in the left-hand nav. */
	name: string;
	/**
	 * Directory to scan for this project's documents. Relative to the project
	 * root, or — when `repo` is set — to that repo's mapped checkout.
	 */
	docsDir: string;
	/** Id/URL namespace for this project's documents. Defaults to a kebab-cased `name`. */
	slug?: string;
	/**
	 * Repo identity (`org/repo`) whose checkout holds this project's docs. The
	 * identity must appear in the `repos` map; where the checkout lives is the
	 * map's business, so the committed config never embeds a machine's layout.
	 */
	repo?: string;
	/**
	 * Write this project's manifest into its own checkout even when the checkout
	 * lives outside the project root. Off by default, because `weft index`
	 * dirtying the git status of a repo it does not own is a surprise; opt in
	 * for a co-owned repo that wants its manifest alongside its docs.
	 */
	manifestInRepo?: boolean;
}

/** A project as recorded in a manifest — always has its slug resolved. */
export interface WeftProjectRef {
	name: string;
	slug: string;
	/** Relative to the project root, or to `repo`'s checkout when `repo` is set. */
	docsDir: string;
	/** Repo identity (`org/repo`) the docs live in, for roots outside the project's own repo. */
	repo?: string;
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
	/**
	 * Local checkouts of other repos, keyed by repo identity (`org/repo`).
	 *
	 * The map does two jobs: a `projects` entry may name a `repo` instead of
	 * embedding a relative path, and a GitHub blob URL to a mapped repo resolves
	 * against its checkout — becoming a graph edge when the file falls inside a
	 * configured docs root.
	 *
	 * Values are paths — relative to the project root, absolute, or `~`-prefixed.
	 * Because they describe one machine's layout, they belong in
	 * `weft.config.local.yaml` (gitignored) rather than the committed config;
	 * local entries override committed ones per identity.
	 */
	repos?: Record<string, string>;
	/** Default theme when no user preference is saved. Falls back to system preference if unset. */
	defaultTheme?: "light" | "dark";
	/**
	 * ui-std-lib style: one theme name (fixed scheme, toggle hidden) or a
	 * {dark, light} pair the toggle switches between. Defaults to
	 * dark=luminous-precision / light=summer-cloud.
	 */
	style?: StyleConfig;
	/**
	 * Base URL serving ui-std-lib theme CSS and manifest.json (e.g. a jsDelivr
	 * styles/ path) — the escape hatch for themes newer than the styles
	 * package the UI was built with.
	 */
	styleUrl?: string;
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
	/**
	 * Contribution files an external build writes, as globs relative to the
	 * project root. Merged into the manifest after source is indexed.
	 */
	contributions?: string[];
	/**
	 * Generated outputs to register as nodes, as globs relative to each docs
	 * root. A PDF built from a document is not indexable, so without this there
	 * is nothing for a `derives-from` edge to point at.
	 *
	 * Relative to the docs root rather than the project root so ids stay clean
	 * and resolvable; an output living elsewhere is declared by a contribution
	 * instead.
	 */
	artifacts?: string[];
	/**
	 * Extra file extensions to index, beyond the built-in defaults, mapped to
	 * the doc type each should parse as. Keys carry the leading dot (`.qmd`),
	 * matching `EXTENSION_MAP`'s own key style.
	 *
	 * Additive only: a key already known to `EXTENSION_MAP` with a *different*
	 * value is rejected at load time, since silently remapping a built-in
	 * extension would change how every already-indexed file of that type
	 * parses. A key that agrees with its built-in mapping (`.json: openapi`) is
	 * allowed — it only opts an unindexed-by-default type into scanning.
	 */
	extensions?: Record<string, "markdown" | "openapi">;
	/**
	 * Global defaults for `includes` edges. Each option can be overridden per
	 * edge in the sidecar that declares it. Resolved values are stamped onto the
	 * edges at build time, so the manifest is self-contained.
	 */
	includes?: IncludeDefaults;
}

/**
 * How an included section's heading levels relate to the document they land in.
 *
 * `auto` demotes the included headings beneath the heading level at the point
 * of inclusion, so the composed document reads as one outline. `none` preserves
 * the source levels, for sources already authored at the right depth — an FAQ
 * whose answers are all written as `##` sections, say.
 */
export type IncludeHeadingShift = "auto" | "none";

/**
 * Where included content counts for search and navigation.
 *
 * `source` attributes it only to the node it came from, so a search never
 * returns duplicate hits. `inline` also attributes it to the including
 * document — a reader searching the FAQ finds the FAQ.
 */
export type IncludeContributes = "source" | "inline";

/** Global defaults for include edges, overridable per edge in the sidecar. */
export interface IncludeDefaults {
	headingShift?: IncludeHeadingShift;
	contributes?: IncludeContributes;
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
	/**
	 * Text the slug was derived from: the heading as rendered, with inline
	 * markup resolved, or the operation id / schema name.
	 *
	 * Rendered rather than raw because that is what the page slugs, so an id in
	 * the document and an anchor in the graph cannot disagree.
	 */
	text: string;
	/** 1-based line in the source file. Absent for anchors with no line, such as OpenAPI. */
	line?: number;
	/** Heading level, 1-6. Absent for anchors that are not headings. */
	level?: number;
}

export interface WeftNode {
	id: string;
	/**
	 * What kind of thing this node is.
	 *
	 * `artifact` is a generated output — a PDF built from markdown, say. It is a
	 * full graph node and a valid edge endpoint, but it is not a document: it has
	 * no anchors, nothing to render, and it never appears in navigation. Consumers
	 * that read a node's content must skip it, since reading a binary as text
	 * succeeds and yields nonsense rather than failing.
	 */
	type: "markdown" | "openapi" | "artifact";
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
	/**
	 * Version the document declares in its own frontmatter.
	 *
	 * Declared rather than computed, because only the author knows which edits
	 * constitute a new version. Absence is normal and never an error — an
	 * append-only registry has no version to give.
	 */
	version?: string;
	/**
	 * When the document last changed, as an ISO 8601 timestamp with offset.
	 *
	 * Taken from the last commit touching the file rather than from the
	 * filesystem: git does not preserve modification times, so a fresh clone or
	 * a CI checkout makes every file look simultaneously modified — meaningless
	 * in exactly the environment these checks run in. Absent when the file is
	 * untracked, uncommitted, or the project is not a git repository.
	 */
	modified?: string;
}

/**
 * Claims a link makes about the document it points at, checked against that
 * document's current state.
 *
 * A key-value bag rather than a `version` field, because a mechanism built for
 * version alone needs reopening the first time someone cites a length or a
 * date. Every value is optional, and asserting nothing is the normal case.
 */
export interface Assertions {
	/** The target's declared version, compared exactly as written. */
	version?: string;
	/**
	 * The target's length. A number must match exactly; `"~3500"` allows ten
	 * percent either way, for the "roughly N lines" claim prose actually makes.
	 */
	lineCount?: number | string;
	/**
	 * When the target last changed, as a prefix of its ISO timestamp — `"2026-07"`
	 * accepts any day in that month, and a full timestamp matches only itself.
	 */
	modified?: string;
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
	 * The link path as written, when it differed from the node it resolved to —
	 * a link to a document's published form (`guide.html`) pointing at the source
	 * it was rendered from (`guide.md`). Absent when the link already named a node.
	 */
	resolvedFrom?: string;
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
	/**
	 * Claims this link makes about its target. Like `pending`, only a sidecar
	 * link can declare them — an inline Markdown link has nowhere to put them.
	 */
	asserts?: Assertions;
	/**
	 * On an `includes` edge: how the included headings are levelled into the
	 * including document. Stamped from config defaults at build time, so a
	 * manifest consumer never has to know what the defaults were.
	 */
	headingShift?: IncludeHeadingShift;
	/**
	 * On an `includes` edge: whether the included content is searchable only
	 * under its source node or also under the including document. Stamped from
	 * config defaults at build time, like `headingShift`.
	 */
	contributes?: IncludeContributes;
	/**
	 * On a `derives-from` edge: the source's content hash at the moment the
	 * artifact was generated. An artifact is stale when this no longer equals the
	 * source's current hash.
	 *
	 * Kin to `asserts` — both record what was true when written — but kept
	 * separate because the finding differs. A stale assertion is fixed by editing
	 * the claim; a stale artifact is fixed by regenerating it.
	 *
	 * Recorded by whatever did the generating, which is the only party that knows
	 * it. `hashContent` documents the recipe so a build can compute it without
	 * running Weft.
	 */
	sourceHash?: string;
}

/** Presentation config carried in the manifest so the UI needs no config access. */
export interface SiteConfig {
	defaultTheme?: "light" | "dark";
	style?: StyleConfig;
	styleUrl?: string;
	layout?: "reader" | "default";
	siteTitle?: string;
	siteUrl?: string;
	ogImage?: string;
}

/**
 * Provenance for a manifest — when it was built, and a baseline of what it
 * was built from.
 *
 * Lives on the manifest itself rather than beside it: every consumer that
 * reads `manifest.json` directly (SSR, a static build script) gets one read
 * with no way to end up with a graph and no idea how stale it is.
 */
export interface ManifestBuild {
	/** When the manifest was built, as an ISO 8601 UTC timestamp (`toISOString()` form). */
	builtAt: string;
	/**
	 * Baseline hash of the state the manifest was built from: the sorted set
	 * of indexed file and artifact paths, plus the content of every input
	 * that is not itself a node — sidecar files, contribution files, and the
	 * config files (including the machine-local overlay).
	 *
	 * Comparing it against a fresh computation catches a node added or
	 * removed — document or artifact — or a change to one of those non-node
	 * inputs. It does not cover an edited node's content — every node already
	 * carries its own `contentHash` for that, so re-hashing it here would be
	 * redundant.
	 */
	inputsHash: string;
}

export interface Manifest {
	version: number;
	nodes: WeftNode[];
	edges: WeftEdge[];
	/** Configured projects. Present only in multi-project mode. */
	projects?: WeftProjectRef[];
	/** Presentation config for the UI. Absent when nothing is configured. */
	site?: SiteConfig;
	/** When and from what this manifest was built. Absent from a pre-freshness manifest. */
	build?: ManifestBuild;
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

/** Whether a manifest still reflects the docs tree it was built from. */
export type FreshnessStatus = "fresh" | "stale" | "unknown";

/**
 * Result of comparing a manifest's recorded provenance against its docs tree.
 *
 * `unknown` is not a hedge — it is the honest answer for a manifest built by
 * an older Weft that carries no `build` block to compare at all. Collapsing
 * it into `fresh` would claim confidence about provenance that was never
 * recorded; collapsing it into `stale` would make every pre-upgrade manifest
 * look broken.
 */
export interface Freshness {
	status: FreshnessStatus;
	/** When the manifest was built. Absent when `status` is "unknown". */
	builtAt?: string;
}

export interface SearchResult {
	id: string;
	title: string;
	anchor?: string;
	score: number;
	match: Record<string, string[]>;
}
