# Weft — Design Decisions

## DD-1: Primary implementation language

**Status:** Decided

### Context
Weft has three deployment contexts that share core logic:
1. **CLI + local server** — single Node process: CLI commands, HTTP/WebSocket API for the UI
2. **Browser UI** — Vite-bundled React app (graph browser, renderers, split pane)
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
