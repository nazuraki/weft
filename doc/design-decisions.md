# Weft — Design Decisions

## DD-1: Primary implementation language

**Status:** Decided

### Context
Weft has three deployment contexts that share core logic:
1. **CLI + local server** — single Node process: CLI commands, HTTP/WebSocket API for the UI
2. **Browser UI** — Vite-bundled Svelte app (renderers, split pane, search)
3. **VSCode extension** — webview panel + gutter decorations (runs in VS Code's Node host)

The graph model, link parser, anchor registry, and manifest builder are core logic needed
across all three. The language choice determines how much code can be shared vs duplicated,
distribution model, and CLI performance characteristics.

### Options

#### TypeScript (current assumption in implementation.md)

One language across all four targets. Core logic is a shared package consumed by CLI, server,
UI, and VSCode extension. No serialization boundary between layers.

| Dimension | Assessment |
|---|---|
| Code sharing | Full — same `@weft/core` package imported by CLI, browser, and VSCode |
| UI/VSCode | Native fit — React, VS Code Extension API are JS/TS |
| CLI performance | Node startup overhead (~100-300ms); acceptable for `serve`, noticeable for `check` in CI |
| Distribution | `npm install -g weft` or `npx weft` — requires Node runtime on target machine |
| Ecosystem | Rich — every rendering lib needed (pdf.js, mermaid, OpenAPI renderers) is JS-native |
| Build complexity | Low — standard pnpm monorepo, one toolchain |
| MCP server | Straightforward — Node process, stdio or HTTP transport |

**Risk:** Distribution friction for non-Node projects. A Go or Python shop needs Node installed
just to run `weft`. Mitigated partially by npx or by bundling with pkg/bun compile.

#### Rust (core + CLI) / TypeScript (UI + VSCode)

Rust for the performance-sensitive parts (CLI, server, graph engine). TypeScript for the
browser UI and VSCode extension. Core types shared via generated TypeScript bindings or
a JSON schema contract.

| Dimension | Assessment |
|---|---|
| Code sharing | Partial — Rust core can compile to WASM for browser use, but adds build complexity |
| UI/VSCode | TypeScript still required for these targets |
| CLI performance | Excellent — near-instant startup, fast graph traversal on large repos |
| Distribution | Single static binary — `curl | sh`, Homebrew, GitHub releases. No runtime dependency |
| Ecosystem | Rendering libs (pdf.js, mermaid, OpenAPI) are JS — Rust can't use them directly |
| Build complexity | High — two toolchains, WASM compilation, generated type bindings, CI for multiple platforms |
| MCP server | Well-supported — Rust MCP SDK exists |

**Risk:** The import pipeline and document renderers are inherently JS-ecosystem (LibreOffice
subprocess aside). Rust only benefits the graph engine and CLI — but those aren't the bottleneck
in typical usage. The complexity tax may not pay for itself.

#### Go (core + CLI) / TypeScript (UI + VSCode)

Similar split as Rust but with Go. Simpler language, faster compilation, but no WASM story
for sharing core logic with the browser.

| Dimension | Assessment |
|---|---|
| Code sharing | Minimal — Go core cannot run in browser, so graph logic must be duplicated in TS for the UI |
| UI/VSCode | TypeScript still required |
| CLI performance | Very good — fast startup, good enough for CI |
| Distribution | Single static binary — same advantages as Rust |
| Ecosystem | Go has no equivalent of the JS rendering libs needed |
| Build complexity | Medium — two toolchains but Go is simpler than Rust |
| MCP server | Well-supported — Go MCP SDK exists |

**Risk:** Core logic duplication between Go and TypeScript. Every change to graph model, link
parsing, or anchor resolution must be implemented twice. This is the worst outcome for
long-term maintenance.

#### Bun (TypeScript runtime alternative)

Same TypeScript codebase but use Bun instead of Node as the runtime. Bun compiles to a single
executable, has faster startup than Node, and is a drop-in replacement for most Node APIs.

| Dimension | Assessment |
|---|---|
| Code sharing | Full — same `@weft/core` package imported by CLI, browser, and VSCode |
| UI/VSCode | Same — React, VS Code Extension API |
| CLI performance | Better than Node — ~50ms startup, fast file I/O |
| Distribution | `bun build --compile` produces a single binary — no runtime dependency |
| Ecosystem | High compatibility with npm packages; some edge cases with native modules |
| Build complexity | Low — similar to Node, single toolchain |
| MCP server | Same as Node — stdio or HTTP transport |

**Risk:** Bun compiled binary and `npx weft` are two separate distribution paths — not a
unified story. `npx` runs on Node regardless. Supporting both means testing both. VSCode
extension host also runs on Node regardless — Bun only helps the CLI+server context.
Native module compatibility gaps exist but are shrinking.

### Analysis

The rendering ecosystem locks Weft into TypeScript for the browser UI and VSCode extension
regardless of CLI language choice. The question is whether CLI performance or distribution
model justifies a second language for the CLI+server context alone.

For a tool that developers run interactively (`weft serve`) or in CI (`weft check`), the
difference between 200ms (Node) and 10ms (Rust) startup is real but not decisive. The
difference between "requires Node" and "single binary" matters more for adoption in non-Node
shops — but those users can install via Homebrew or a curl script even with a Node-based tool
(many CLI tools bundle their runtime).

Bun's compiled binary is an interesting distribution option, but it doesn't replace `npx` —
it's an additional distribution path. And the VSCode extension runs on Node regardless.

### Decision

**TypeScript throughout. Node is the default runtime. Bun is an optional accelerator.**

- Primary distribution: `npx weft` / `npm install -g weft` — runs on Node
- Optional: install `weft-bun-<arch>` (e.g., `weft-bun-darwin-arm64`) as a project dependency.
  When present, the `weft` CLI and MCP server use the compiled Bun binary instead of Node.
- The `weft` npm package detects the optional binary at startup and delegates to it if available.
  No code changes — same TypeScript, different runtime.
- VSCode extension always runs on Node (VS Code's host runtime). Browser UI is bundled JS.
  The Bun optimization only applies to CLI + server + MCP contexts.

This gives us `npx` as the zero-friction default, with a fast-binary upgrade path that
doesn't fork the codebase. The optional dependency pattern is proven (esbuild, swc, Prisma
engines all do this).

---

## DD-2: UI framework

**Status:** Decided

### Context
The browser UI needs: a split pane with independent navigation stacks, document renderers
(wrapping mostly vanilla JS libraries), a command-palette-style link picker, and search.
The same app (or a subset) runs in the VSCode webview panel.

Most of the rendering libraries Weft wraps are **not React-native**:
- **pdf.js** — vanilla JS, renders to canvas
- **Redoc / Stoplight Elements** — web components or vanilla JS (React wrappers exist but aren't required)
- **Mermaid** — renders SVG, vanilla JS
- **Syntax highlighting** (Shiki, Prism) — vanilla JS

### Options

#### React + Vite

| Dimension | Assessment |
|---|---|
| Ecosystem | Largest — most rendering libs have React wrappers available |
| Graph visualization | React Flow — purpose-built for interactive node graphs, excellent DX |
| Bundle size | ~40-50KB gzipped (React + ReactDOM) before app code |
| VSCode webview | Works, but full React bundle is heavy for a side panel |
| AI agent familiarity | Highest — agents generate React code most reliably |
| Learning curve | You know it already |

**Concern:** React is a lot of framework for what is fundamentally a document viewer with
navigation. The split pane and renderers don't benefit much from React's re-render model.
Most of the work is imperative DOM manipulation (rendering a PDF page, mounting a web
component).

#### Preact + Vite

Drop-in React replacement at ~3KB gzipped. Supports React Flow and most React libraries via
`preact/compat` alias.

| Dimension | Assessment |
|---|---|
| Ecosystem | React-compatible via compat layer — most things work |
| Graph visualization | React Flow works via compat (some edge cases) |
| Bundle size | ~3KB gzipped — significant reduction |
| VSCode webview | Much lighter, better fit for embedded panel |
| AI agent familiarity | High — same JSX/component model, agents treat it as React |
| Compat risk | Occasional subtle differences; compat layer adds debugging friction |

**Concern:** The compat layer works until it doesn't. Debugging failures in React libraries
running through Preact compat is unpleasant.

#### Svelte 5 + SvelteKit (or just Vite)

Compiler-based — no runtime framework in the bundle. Components compile to efficient
imperative DOM updates.

| Dimension | Assessment |
|---|---|
| Ecosystem | Smaller than React but growing; most vanilla JS libs wrap easily |
| Graph visualization | Cytoscape.js or D3 (no React Flow, but these are more flexible) |
| Bundle size | Near-zero framework overhead — output is vanilla JS |
| VSCode webview | Lightest option — ideal for embedded panel |
| AI agent familiarity | Lower — agents produce less reliable Svelte code than React |
| Learning curve | New framework for you, but simple model |

**Concern:** Smaller ecosystem means more DIY for UI components. AI agents are less fluent
with Svelte, which matters for a tool whose own development will likely involve AI assistance.

#### Vanilla JS + Web Components + Vite

No framework. Custom elements for pane, renderer, link picker. State management via a small
reactive library (e.g., nanostores) or plain event emitters.

| Dimension | Assessment |
|---|---|
| Ecosystem | Direct access to all vanilla JS rendering libs — no wrappers needed |
| Graph visualization | Cytoscape.js, D3, or vis-network — all framework-agnostic |
| Bundle size | Minimal — only what you write + rendering libs |
| VSCode webview | Lightest possible |
| AI agent familiarity | Medium — agents can write web components but less structured output |
| Complexity risk | State management and component composition require more manual plumbing |

**Concern:** Without a framework's component model and reactive state, the split pane
navigation stack and link picker UI become more manual wiring. Not hard, but more surface
area for bugs.

### Analysis

The rendering libraries are framework-agnostic — React doesn't help wrap them. The UI is
a document viewer with navigation: split pane, search, link picker. Most of the work is
imperative DOM manipulation (render a PDF canvas, inject an SVG, mount a web component).
This is a better fit for a compiler-based framework like Svelte than a virtual DOM framework
like React.

The AI-agent-familiarity factor is real but temporary — model capabilities with non-React
frameworks improve continuously.

### Decision

**Svelte 5 + Vite. No graph visualization library.**

- Svelte's compiler model produces minimal JS — no framework runtime in the bundle. Best
  fit for a document viewer where most rendering is imperative DOM manipulation (pdf.js
  canvas, Mermaid SVG, web components).
- No graph overview visualization (see DD-3). The primary UI is a split pane with search
  and a linked-items sidebar. No Cytoscape.js, D3, or React Flow needed.
- Lightest possible VSCode webview — no framework runtime overhead in an embedded panel.
- Svelte wraps vanilla JS rendering libraries (pdf.js, Redoc, Mermaid, Shiki) cleanly
  via `use:action` directives — no wrapper components needed.
- AI agent fluency with Svelte is lower than React today but sufficient, and improving.

---

## DD-3: No graph overview visualization

**Status:** Decided

### Context
Early designs assumed a visual graph overview — a zoomable canvas showing all document nodes
and their edges, like a dependency diagram. This drove the React Flow dependency and influenced
the framework choice.

### Decision

**No graph overview. The graph is the engine, not the interface.**

Users don't start from "show me the graph." They start from:
- **A specific document** — open the README, an API spec, a design doc
- **A search** — "where's the auth endpoint spec?"
- **A traversal** — "what's linked to this section?" (rendered as a list, not a diagram)

The graph structure powers search ranking, traversal, impact analysis (`weft analyze`),
coverage detection, and staleness checks. But the user interacts with documents and links,
not nodes and edges.

The primary UI is a **split pane** with:
- Document content in each pane
- A linked-items sidebar (list of related documents/anchors for the current view)
- Search (full text + anchor names)
- Navigation history (back/forward per pane)

This eliminates the need for any graph visualization library (React Flow, Cytoscape.js, D3)
and simplifies the UI significantly. If a visual overview proves useful later, it can be added
as a secondary view without affecting the core interaction model.

---

## DD-4: No desktop app harness

**Status:** Decided

### Context
The UI could be served to a browser (`weft serve`), wrapped in a desktop shell (Electron,
Tauri), or both. The question is whether native OS integration — dock icon, window management,
file associations — justifies an app harness.

### Options considered
- **Browser only** — `weft serve` opens a tab. Zero additional dependencies.
- **Tauri** — Rust shell using the system webview. Light (~5MB), native window, file
  associations. But adds Rust to the toolchain and platform-specific packaging.
- **Electron** — Bundles Chromium + Node. ~150MB+. Completely at odds with lightweight goals.

### Decision

**No harness. Browser only.**

- Weft is a developer tool launched from a terminal in a project directory. A browser tab
  is the natural target — developers already have a browser open.
- The VSCode extension covers the "integrated in my editor" use case without a separate app.
- `weft build` (static export) covers the stakeholder review use case (UC-15) without
  requiring any local process — just a hosted site.
- Tauri could be revisited later for a polished standalone experience, but it's not needed
  for v1 and would add Rust to the build toolchain (contradicting DD-1).

---

## DD-5: Local server and service architecture

**Status:** Decided

### Context
Three consumers need the same core operations (search, traverse, read, write, analyze):
the browser UI (via HTTP API), the MCP server (via stdio), and the CLI (direct calls).
The server choice and the code-sharing architecture are coupled decisions.

### Options considered

#### SvelteKit with adapter-node
Already in the stack for the UI (DD-2). Server routes handle the API. `weft serve` starts
one process serving both UI and API on one port.

#### Hono (separate API server) + Vite (UI dev server)
Lightweight standalone HTTP framework. API and UI are separate processes in dev, combined
in production via a custom build step. Clean separation but more glue.

#### Fastify / Express
Heavier server frameworks. No advantage over Hono for thin adapter routes.

### Decision

**SvelteKit with adapter-node. Ports-and-adapters service architecture.**

Core business logic lives in `@weft/core` as a transport-agnostic `WeftService`:

```
@weft/core — WeftService
├── search(query) → results
├── traverse(nodeId, direction) → linked nodes
├── read(nodeId, anchor?) → content
├── write(nodeId, content) → void
├── authorLink(from, to, type) → void
├── appendDecisionLog(nodeId, entry) → void
├── analyze(options) → report
└── watch(callback) → unsubscribe
```

Three thin adapter layers, each importing `@weft/core` directly:

- **`@weft/ui`** — SvelteKit app. Server routes are one-liner adapters that call
  `WeftService` methods. UI and API served from one process, one port.
- **`@weft/mcp`** — MCP server (stdio transport). Tool definitions map to `WeftService`
  methods. Separate process, no HTTP dependency.
- **`@weft/cli`** — CLI commands call `WeftService` directly. Same process, no server.

Each consumer instantiates its own `WeftService` from the project config. The graph is
derived from the filesystem — no shared mutable state between processes.

### Rationale
- SvelteKit eliminates the need for a separate API framework — server routes are already
  there and the handlers are trivially thin.
- The MCP server does not call the HTTP API — it uses `@weft/core` directly. No unnecessary
  network hop, no dependency on `weft serve` running.
- The CLI does not need a server at all for commands like `weft check` and `weft analyze`.
- All business logic is testable against `WeftService` without standing up HTTP or MCP.

---

## DD-6: Search engine

**Status:** Decided

### Context
Search is a primary entry point (DD-3 — users start from a search, not a graph overview).
It's used by the browser UI, MCP server, CLI, and VSCode extension. The search needs to cover:
- Document titles and full text
- Anchor names (headings, operation IDs, schema names)
- Annotations and decision log entries

There are two fundamentally different search models:

**Keyword/full-text search** — user types exact or partial terms, engine matches tokens.
Good for "find the auth endpoint spec" where the user knows the terminology.

**Vector similarity search** — content is embedded into vectors, queries find semantically
similar content. Good for "find docs related to how we handle user sessions" where the user
describes intent rather than exact terms. Also enables "find docs similar to this code change"
which is central to UC-7 (AI updates docs) and UC-9 (PR review flags stale docs).

### Options

#### MiniSearch (full-text only)

Lightweight in-memory full-text search library (~7KB). Builds an inverted index from
document content. Supports prefix matching, fuzzy matching, field boosting.

| Dimension | Assessment |
|---|---|
| Index size | In-memory; fine for hundreds of docs, may strain at thousands |
| Query speed | Sub-millisecond for typical corpus sizes |
| Dependencies | Single npm package, no native modules |
| Rebuild cost | Fast — full reindex on `weft index`, incremental on file watch |
| Semantic understanding | None — keyword matching only |
| Works offline | Yes — no external services |

#### SQLite FTS5 (full-text only)

Full-text search via SQLite's FTS5 extension. Persisted index on disk. Supports ranking,
phrase queries, boolean operators.

| Dimension | Assessment |
|---|---|
| Index size | On disk; handles large corpora well |
| Query speed | Fast, even for large datasets |
| Dependencies | better-sqlite3 (native module — adds build complexity, Bun compat risk) |
| Rebuild cost | Fast; supports incremental updates |
| Semantic understanding | None — keyword matching only |
| Works offline | Yes |

**Concern:** Native module complicates the Bun optional binary story (DD-1) and adds
platform-specific build steps.

#### Embedded vectors (semantic search)

Embed document chunks into vectors at index time, store in a local vector index, query
by embedding the search string and finding nearest neighbors.

Embedding options:
- **Local model (e.g., Xenova/transformers.js with a small model):** Runs in-process,
  no API key, ~50-100MB model download. Slow first load, fast after.
- **API-based (OpenAI, Anthropic, Cohere, Voyage):** Fast, high quality, requires API key
  and network. Privacy concern — doc content leaves the machine.

Vector storage options:
- **In-memory (hnswlib-node, vectra):** Simple, fast, no external deps beyond the native
  HNSW module. Rebuilt on index.
- **SQLite + sqlite-vss:** Vector search extension for SQLite. Same native module concern
  as FTS5, but gets both FTS and vector search from one dependency.
- **LanceDB:** Embedded vector database, serverless, supports JS. No external service.

| Dimension | Assessment |
|---|---|
| Index size | Vectors add ~1-4KB per chunk (depends on model dimension) |
| Query speed | Sub-millisecond for nearest-neighbor on typical corpus |
| Dependencies | Embedding model or API + vector storage library |
| Rebuild cost | Slow if re-embedding entire corpus; incremental helps |
| Semantic understanding | Yes — "find docs about authentication" matches "login flow", "OAuth", "session management" |
| Works offline | Only with local embedding model |

**Key advantage for AI use cases:** When an AI agent asks the MCP server "find documentation
related to this code change," vector similarity surfaces semantically relevant docs even when
there's no keyword overlap. This directly supports UC-6 (AI context), UC-7 (AI updates docs),
UC-9 (PR review), and UC-12 (impact scoping).

#### Hybrid: MiniSearch + embedded vectors

Full-text search for exact/keyword queries, vector similarity for semantic queries. Results
merged with a scoring strategy (e.g., reciprocal rank fusion). Search API accepts both modes
or auto-detects.

| Dimension | Assessment |
|---|---|
| Complexity | Two indexes to build and maintain |
| Coverage | Best of both — exact term matches AND semantic similarity |
| Configuration | Users who don't want vector search can disable it (no API key, no model download) |
| Default experience | Full-text works out of the box, vector search is opt-in |

### Analysis

Full-text search is table stakes — it must work out of the box with zero configuration.
MiniSearch handles this with no native dependencies and trivial integration.

Vector similarity is where the differentiation is, especially for MCP/AI use cases. An agent
asking "what docs relate to this code change" gets dramatically better results from semantic
search than keyword matching. But it comes with a cost: either a model download or an API key.

The hybrid approach lets the tool work immediately (full-text) while offering an upgrade path
(vectors) that's most valuable for the AI-assisted workflows. The embedding provider can be
configurable — local model by default for privacy, API-based as an option for quality.

### Decision

**Hybrid: MiniSearch (always on) + local embedding model (opt-in). Unified search API.**

- **MiniSearch** for full-text/keyword search — zero config, no native deps, always available.
- **Semantic search** via transformers.js with a local ONNX model (e.g., `all-MiniLM-L6-v2`) —
  opt-in via config. Runs on CPU, no GPU required. ~25-80MB model downloaded once, cached.
  ~10-50ms per chunk for embedding, queries ~10ms.
- **Embedding provider is configurable** — local model by default when enabled. Can be
  overridden to use an API provider (OpenAI, Voyage, etc.) via `weft.config.ts` for teams
  that prefer higher-quality embeddings and accept the privacy/network tradeoff.

#### Index persistence and staleness

Both indexes (full-text and vector) are persisted to `.weft/` and support incremental updates.
CLI commands load the cached index rather than rebuilding from scratch on every invocation.

- **Full-text index:** Serialized via `MiniSearch.exportJSON()` to `.weft/search-index.json`.
  An mtime map is stored alongside it.
- **Vector index:** Stored at `.weft/vectors.bin` with its own mtime map.
- **Staleness check on CLI startup:** Stat all doc files, compare mtimes against stored values.
  Changed files are incrementally re-indexed (MiniSearch `remove()` + `add()`, re-embed changed
  chunks). Unchanged files are not touched.
- **Full rebuild** on `weft index`, on corrupt/missing index files, or when the index format
  version changes.
- **During `weft serve`:** File watcher triggers incremental updates and re-serializes to disk.
  The in-memory index stays warm; the disk cache stays current for the next CLI invocation.

| Scenario (500 docs, 1 changed) | Cost |
|---|---|
| Full rebuild every time | ~500ms-1s |
| Load cached index, no changes detected | ~10-15ms |
| Load cached index, incremental update (1 doc) | ~15-25ms |

#### Unified search API

Single `search()` method on `WeftService`. Consumers never merge results themselves.

```typescript
search(query: string, options?: SearchOptions): SearchResult[]

interface SearchOptions {
  mode?: 'all' | 'fulltext' | 'semantic';  // default: 'all'
  limit?: number;
}

interface SearchResult {
  nodeId: string;
  anchor?: string;
  title: string;
  snippet: string;
  score: number;           // unified score (reciprocal rank fusion when both modes active)
  matchedBy: ('fulltext' | 'semantic')[];
}
```

- `mode: 'all'` (default) runs both engines if semantic is enabled, merges via reciprocal
  rank fusion, returns one ranked list. Falls back to fulltext-only if semantic is disabled.
- `matchedBy` tells consumers how each result was found — useful for UI indicators and
  debugging.
- Explicit `mode: 'fulltext'` or `mode: 'semantic'` available for consumers that need one
  specifically (e.g., an agent looking up an exact function name vs finding conceptually
  related docs).

#### Configuration

```typescript
// weft.config.ts
export default defineConfig({
  search: {
    semantic: {
      enabled: false,       // opt-in
      provider: 'local',    // 'local' | 'openai' | 'voyage' | custom
      model: 'all-MiniLM-L6-v2',  // default local model
    },
  },
});
```

---

## DD-7: Sidecar file format

**Status:** Decided

### Context
Sidecar files (`<file>.weft`) store links and annotations for binary or converted-format
sources where embedding metadata in the source is not possible (PPTX, PDF, Figma). These
files are committed to the repo, reviewed in PRs, and occasionally hand-edited.

### Options considered
- **JSON** — universal, strict syntax, no comments, noisy for arrays of objects (closing
  braces/brackets), poor multiline string support.
- **YAML** — human-readable, supports comments, clean multiline strings, compact for arrays
  of objects. Already in the ecosystem (OpenAPI specs, Markdown frontmatter).
- **TOML** — good for flat config, but `[[array]]` syntax adds visual noise when the file
  is primarily arrays of objects (links, annotations). Scales poorly at 20+ entries.

### Decision

**YAML.**

- Sidecars are arrays of structured objects with occasional free-text (annotation bodies,
  labels). YAML's indented list syntax is the most scannable format for this shape of data.
- Supports inline comments — useful for noting why a link exists or flagging a broken one.
- Already familiar in the ecosystem — OpenAPI specs are YAML, Markdown frontmatter is YAML.
  No new format for users to learn.
- Multiline strings (`|` or `>` block scalars) handle annotation bodies cleanly.

```yaml
# overview.pptx.weft
source: docs/slides/overview.pptx
converted: docs/slides/overview.html

links:
  - anchor: slide-4
    elementSelector: "#slide-4 .shape-3"
    target: docs/api.yaml#/paths/users/get
    type: references
    label: User API

  - anchor: slide-7
    target: docs/db-schema.md#users-table
    type: references
    label: Users table schema

annotations:
  - anchor: slide-2
    author: wil
    created: 2025-03-19
    body: This slide understates the caching layer complexity.

  - anchor: slide-4
    author: dana
    created: 2025-03-20
    body: |
      The API contract shown here is outdated.
      See the updated spec for the new pagination params.
```

---

## DD-8: Licensing and distribution model

**Status:** Decided

### Context
Weft is a developer tool that reads and writes files in a project repository. Decisions
about open source vs proprietary and license choice affect adoption, community contributions,
corporate usability, and future commercial options.

### Options considered
- **MIT** — maximally permissive, universal default. No restrictions on use, modification,
  or redistribution. No protection against a competitor hosting the software as a service.
- **Apache 2.0** — like MIT with explicit patent grant. Slightly more formal contributor
  protections. Same permissiveness otherwise.
- **AGPL** — copyleft. Requires anyone serving the software over a network to open-source
  their modifications. Protects against cloud strip-mining but many companies have blanket
  AGPL bans.
- **ELv2 (Elastic License v2)** — source-available, not OSI-approved. Permits everything
  except offering the software as a managed service. Used by Elastic, others.
- **BSL / FSL** — source-available, converts to open source after 2-4 years. Not
  OSI-approved. Used by HashiCorp, Sentry.

### Decision

**Open source under MIT license.**

- **Adoption first.** Developer tools live or die on adoption. MIT has zero friction — no
  corporate legal review, no license compatibility concerns, no "is this really open source?"
  confusion.
- **Trust.** Weft reads and writes files in your repo. Open source lets people audit what
  it does. Source-available licenses (ELv2, BSL) technically allow this but carry perception
  baggage.
- **Ecosystem fit.** MCP is open, the tooling around it is open. A non-OSI Weft would be
  the odd one out.
- **Community contributions.** Document renderers, import pipelines, and templates are
  natural extension points. MIT maximizes contributor willingness.
- **Commercial path is unaffected.** A future proprietary product would be a separate
  codebase that imports Weft as a dependency and adds commercial features on top (hosted
  multi-tenant, team management, enterprise auth). MIT on the core does not constrain the
  proprietary layer — it's a different product with different value.
- **SaaS risk is near-zero.** Weft is a local tool that runs in your repo against your docs.
  The "someone hosts it as a competing service" scenario that AGPL/ELv2 protect against is
  not a realistic threat for this category of tool.
- **Patent grant (Apache 2.0) is unnecessary.** No patent-relevant innovation in a JS
  documentation tool. The added formality isn't worth the marginal complexity.
