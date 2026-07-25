# Weft — Development Context

## Current State

Phase 1 implementation is complete. The monorepo has three packages:

### `@weft/core` (packages/core)
- **Config loader** (`src/config.ts`) — loads `weft.config.ts`, provides `defineConfig` helper, and resolves the configured docs roots (`resolveDocsRoots`) — one per `projects` entry, or a single implicit root over `docsDir`
- **Anchor extractors** (`src/anchors/`) — Markdown heading slugs (GitHub algorithm), OpenAPI operation IDs + schema names
- **Link parsers** (`src/links/`) — Markdown relative link extraction, sidecar `.weft` YAML parsing
- **Manifest builder** (`src/manifest.ts`) — scans each docs root (`buildRootGraph`), combines them (`mergeGraphs`), and partitions the result back per project (`splitManifest`)
- **Search index** (`src/search.ts`) — MiniSearch wrapper with full-text search over doc content and anchors
- **WeftService** (`src/service.ts`) — facade: `getManifest()`, `read()`, `search()`, `traverse()`, `watch()`, `rebuild(slug?)`, `writeManifest()`

### `@weft/cli` (packages/cli)
- `weft index` — rebuilds manifest, writes to `docs/.weft/manifest.json`
- `weft serve` — sets `WEFT_ROOT_DIR` env, starts Vite dev server from `@weft/ui`, watches for doc changes

### `@weft/ui` (packages/ui)
- SvelteKit app with adapter-node
- Three-panel layout: doc tree (LHN), main view, linked-items sidebar (RHS)
- API routes: `/api/manifest`, `/api/doc/[...path]`, `/api/search?q=`, `/api/traverse?node=&direction=`, `/api/openapi/[...path]`
- Components: DocTree, DocView, MarkdownRenderer (with in-app link interception), OpenApiRenderer, LinkedItems, Breadcrumbs, SearchPalette (Cmd+K)
- Navigation store with stack, breadcrumbs, back/forward

## Key Decisions
- `@weft/core` exports TypeScript source directly (`main: src/index.ts`) — Vite handles transpilation, no separate build step needed for dev
- Standard relative Markdown links (not `@doc:` prefix) — renders on GitHub, Weft identifies graph edges by resolving against docs dir
- MiniSearch for full-text search (semantic search is future opt-in per DD-6)
- OpenAPI renderer: custom Svelte components, no third-party portal renderer (DD-12). `parseOpenApiSpec` exported from `@weft/core` (uses existing `yaml` dep); parsed spec served via `/api/openapi/[...path]`; `$ref` dereferencing deferred
- Multi-project (`projects` config) namespaces node ids by slug (`alpha/api.md`) and writes a manifest per project plus a merged one; single-`docsDir` configs keep bare ids and a single manifest, so the change is opt-in. `WeftService` merges the per-project graphs in memory, so every consumer still sees one `Manifest`

## What's Not Built Yet
- Link authoring UI (Phase 2)
- VSCode extension (Phase 3)
- Annotation system / decision log (Phase 4)
- `weft check`, `weft analyze`, `weft build` commands (Phase 5+)
