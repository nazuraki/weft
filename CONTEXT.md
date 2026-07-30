# Weft — Development Context

## Current State

Phase 1 implementation is complete. The monorepo has three packages:

### `@weft/core` (packages/core)
- **Config loader** (`src/config.ts`) — loads static `weft.config.yaml`/`.yml`/`.json` (plain data, validated at load time; legacy `weft.config.ts`/`.js` fails with a migration error), and resolves the configured docs roots (`resolveDocsRoots`) — one per `projects` entry, or a single implicit root over `docsDir`
- **Anchor extractors** (`src/anchors/`) — Markdown headings parsed with `remark` and slugged via `github-slugger`, OpenAPI operation IDs + schema names. Anchors are `Anchor` objects (`slug`, `text`, and `line`/`level` for headings), not bare strings
- **Link parsers** (`src/links/`) — Markdown relative link extraction, sidecar `.weft` YAML parsing
- **Contributions** (`src/contributions.ts`) — one file format any external build can write, declaring nodes, edges and metadata patches; merged into the manifest after source is indexed
- **Content stats** (`src/content.ts`) — `hashContent`, `countLines`, `normalizeContent`; nodes carry `contentHash` and `lineCount`, computed during the scan
- **Manifest builder** (`src/manifest.ts`) — scans each docs root (`buildRootGraph`), combines them (`mergeGraphs`), and partitions the result back per project (`splitManifest`)
- **Search index** (`src/search.ts`) — MiniSearch wrapper with full-text search over doc content and anchors
- **Validation stage** (`src/validate/`) — `ValidatorRegistry` holds registered checks; `validateManifest` runs them over a built manifest and returns `Diagnostic`s. `rules/edge-resolution.ts` is the first check: every edge target and anchor must resolve
- **WeftService** (`src/service.ts`) — facade: `getManifest()`, `read()`, `search()`, `traverse()`, `validate()`, `watch()`, `rebuild(slug?)`, `writeManifest()`

### `@weft/cli` (packages/cli)
- `weft index` — rebuilds manifest, writes to `docs/.weft/manifest.json`
- `weft analyze` — runs the validation stage and reports; `--json`, `--list-rules`. Always exits 0
- `weft check` — same validation, exits 1 on any error-severity diagnostic, for CI
- `weft serve` — owns the single `WeftService`: builds it, starts the Vite dev server from `@weft/ui` with an inline plugin (`src/api-middleware.ts`) serving `/api/manifest`, `/api/doc/*`, `/api/search?q=`, `/api/traverse?node=&direction=`, and watches for doc changes
- `pnpm dev` at the repo root is just `weft serve .` — one launch path

### `@weft/ui` (packages/ui)
- SvelteKit app with adapter-node
- Three-panel layout: doc tree (LHN), main view, linked-items sidebar (RHS)
- Pure consumer: client code fetches the CLI's `/api` JSON; SSR loads read the manifest file at `WEFT_MANIFEST_PATH` (set by `weft serve`). No server-side `@weft/core` runtime imports — types and `@weft/core/browser` only
- Components: DocTree, DocView, MarkdownRenderer (with in-app link interception), OpenApiRenderer, LinkedItems, Breadcrumbs, SearchPalette (Cmd+K)
- Navigation store with stack, breadcrumbs, back/forward

## Key Decisions
- `@weft/core` resolves to built output (`exports: dist/index.js`) for plain-Node consumers (the CLI), so core must be built before running `weft`. Vite dev still loads TypeScript source via the alias in `packages/ui/vite.config.ts`, and typecheck sees source via the `types` condition — no rebuild in the Vite dev loop. Editing core + running the CLI requires `pnpm --filter @weft/core build` (or `tsc --watch`)
- Standard relative Markdown links (not `@doc:` prefix) — renders on GitHub, Weft identifies graph edges by resolving against docs dir
- MiniSearch for full-text search (semantic search is future opt-in per DD-6)
- OpenAPI renderer: custom Svelte components, no third-party portal renderer (DD-12). `parseOpenApiSpec` exported from `@weft/core/browser`; the client fetches raw spec content via `/api/doc/*` and parses it browser-side; `$ref` dereferencing deferred
- **Service ownership**: exactly one `WeftService` per `weft serve`, constructed and owned by the CLI. The UI never constructs one — it consumes manifest + API JSON. Presentation config (`defaultTheme`, `layout`, `siteTitle`, `siteUrl`, `ogImage`) travels in the manifest's `site` block, so the UI needs no config access. The only CLI→UI handoff is the `WEFT_MANIFEST_PATH` env var (SvelteKit SSR fetch cannot reach Vite middleware, so server loads read the file)
- Multi-project (`projects` config) namespaces node ids by slug (`alpha/api.md`) and writes a manifest per project plus a merged one; single-`docsDir` configs keep bare ids and a single manifest, so the change is opt-in. `WeftService` merges the per-project graphs in memory, so every consumer still sees one `Manifest`
- **One contribution format, never per-tool adapters**: a build writes nodes/edges/metadata patches, weft merges them after indexing source. Merge order is contract, not detail — source first (indexing rendered output would lose sidecars and source structure), then contributions in sorted file order, then ordering/nav filtering over the combined set. Patches may not touch `id`/`type`/`anchors`/`project`: those are extraction facts and topology, and a build contributes what weft *cannot see*. A contributed node colliding with an indexed one warns rather than fails — it usually means build output is landing inside `docsDir`
- **Links holding template syntax produce no edge at all** (`{{ }}`, `{% %}`, `${ }`, `<% %>`) — recording an edge to the unresolved literal would invent a node and make `edge-target-missing` report correct source as broken. Anchor-side template syntax is ignored, since it does not change the target document
- **Content hashes normalize line endings and BOM before hashing**, because git preserves neither across platforms — a raw-byte hash would call every document changed the moment CI checked it out differently from the tree that produced it, the same objection that rules out mtime for staleness. The recipe (strip BOM, CRLF→LF, SHA-256, first 16 hex chars) is documented so an external build can declare a hash rather than have weft recompute it. The hash covers frontmatter too; no file size is recorded, since nothing needs it and it would be ambiguous beside a normalizing hash
- **Unresolved edges are four rules, not one**: a missing document and a missing anchor have different causes and different fixes, and a *deliberately* pending reference is not breakage at all. `pending: true` on a sidecar link moves it to an `info` rule so it stays countable instead of being suppressed, and `edge-pending-resolved` reports the marker once it is no longer needed. Links to non-indexed file types (images, PDFs) are skipped — `extractMarkdownLinks` makes an edge for any path inside a docs root, so those edges exist but were never going to resolve. `INDEXED_EXTENSIONS` is shared between the glob and the check so the two cannot drift
- **Indexed anchors and rendered ids are one algorithm over one input**: the UI renders with `rehype-slug` and core extracts with `remark` + `github-slugger`, both slugging the heading's *rendered text*. Slugging the source line instead diverged on any heading containing a link (`## See [docs](x.md)` → `#see-docsxmd` vs the page's `#see-docs`) and missed setext headings entirely. `markdown.test.ts` in the UI renders fixtures and this repo's own docs, asserting every indexed anchor resolves to an element id — without it either side can regress silently. OpenAPI ids come from `openApiOperationAnchor`/`openApiSchemaAnchor` in `@weft/core/browser`, called by both extractor and renderer for the same reason
- **Anchors are objects, and slugs come from `github-slugger`** (manifest `version: 2`). The hand-rolled slugifier collapsed hyphen runs and stripped every non-ASCII letter, so 37 of this repo's 219 headings disagreed with GitHub and a CJK heading slugged to the empty string — links are authored to render on GitHub (DD-2), so GitHub's slugs are the correct ones. The slugger also owns its own `-1`/`-2` collision suffixes. `Anchor.text` is what lets a rename be told apart from a deletion. Headings inside fenced code blocks are no longer indexed
- **`docOrderStrict` is a nav filter, not a graph filter**: it marks unlisted nodes `hiddenFromNav` and `DocTree` skips them. It used to drop them from `mergeGraphs`' node list, which left every edge touching one of them dangling — this repo's own manifest shipped three such edges. The graph stays complete so every edge endpoint resolves
- **Severity is config's, not the validator's**: a check emits `Finding`s carrying no severity, and the runner stamps each one from `rules` config over the rule's declared default. A check needing two severities (a hard failure and a softer "known pending" variant) declares two rule ids, so each stays independently configurable. Validation reads the finished manifest and never mutates it, so a check can be added without touching the indexer; a validator that throws becomes one `validator-error` diagnostic rather than taking down the run
- **Static config**: `weft.config.yaml` is plain data — no runtime import of `@weft/core`, so user projects need no dependency on it and config loading works identically under plain Node and Vite (no type-stripping / dual-loading concerns). `defineConfig` is gone; typing comes from validation at load time. This also removed the root `@weft/core` devDependency workaround and gen-manifest's hardcoded `WEFT_CONFIG` bypass

## What's Not Built Yet
- Link authoring UI (Phase 2)
- VSCode extension (Phase 3)
- Annotation system / decision log (Phase 4)
- Further validation rules — duplicate/diverged copies, assertion checking, artifact staleness
- `weft build` command (Phase 5+)
