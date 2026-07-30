# Weft — Development Context

## Current State

Phase 1 implementation is complete. The monorepo has three packages:

### `@weft/core` (packages/core)
- **Config loader** (`src/config.ts`) — loads static `weft.config.yaml`/`.yml`/`.json` (plain data, validated at load time; legacy `weft.config.ts`/`.js` fails with a migration error), and resolves the configured docs roots (`resolveDocsRoots`) — one per `projects` entry, or a single implicit root over `docsDir`
- **Anchor extractors** (`src/anchors/`) — Markdown heading slugs (GitHub algorithm), OpenAPI operation IDs + schema names
- **Link parsers** (`src/links/`) — Markdown relative link extraction, sidecar `.weft` YAML parsing
- **Manifest builder** (`src/manifest.ts`) — scans each docs root (`buildRootGraph`), combines them (`mergeGraphs`), and partitions the result back per project (`splitManifest`)
- **Search index** (`src/search.ts`) — MiniSearch wrapper with full-text search over doc content and anchors
- **Validation stage** (`src/validate/`) — `ValidatorRegistry` holds registered checks; `validateManifest` runs them over a built manifest and returns `Diagnostic`s. No checks are registered yet — the stage exists so each one is built against one interface
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
- **Severity is config's, not the validator's**: a check emits `Finding`s carrying no severity, and the runner stamps each one from `rules` config over the rule's declared default. A check needing two severities (a hard failure and a softer "known pending" variant) declares two rule ids, so each stays independently configurable. Validation reads the finished manifest and never mutates it, so a check can be added without touching the indexer; a validator that throws becomes one `validator-error` diagnostic rather than taking down the run
- **Static config**: `weft.config.yaml` is plain data — no runtime import of `@weft/core`, so user projects need no dependency on it and config loading works identically under plain Node and Vite (no type-stripping / dual-loading concerns). `defineConfig` is gone; typing comes from validation at load time. This also removed the root `@weft/core` devDependency workaround and gen-manifest's hardcoded `WEFT_CONFIG` bypass

## What's Not Built Yet
- Link authoring UI (Phase 2)
- VSCode extension (Phase 3)
- Annotation system / decision log (Phase 4)
- Validation rules themselves — the stage and its two commands exist, but no check is registered yet
- `weft build` command (Phase 5+)
