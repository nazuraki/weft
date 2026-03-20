# Weft — Implementation

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript | All packages — core, UI, CLI, MCP, VSCode (DD-1) |
| Runtime | Node (default), Bun (optional) | Bun via optional `weft-bun-<arch>` package (DD-1) |
| UI framework | Svelte 5 + Vite | Compiler-based, no runtime overhead (DD-2) |
| Server | SvelteKit + adapter-node | UI and API in one process (DD-5) |
| VSCode extension | VS Code Extension API | Webview panel + gutter decorations |
| MCP server | @modelcontextprotocol/sdk | stdio transport, imports `@weft/core` directly (DD-5) |
| PPTX conversion | LibreOffice headless | Subprocess via CLI wrapper |
| PDF rendering | pdf.js | In-browser canvas render |
| Mermaid rendering | @mermaid-js/mermaid-cli | SVG output at import time |
| OpenAPI rendering | Redoc or Stoplight Elements | Embedded in renderer pane |
| Syntax highlighting | Shiki | Code file renderer |
| Package manager | pnpm | Monorepo workspace |
| License | MIT | Open source (DD-8) |

---

## Architecture

Ports-and-adapters (DD-5). All business logic lives in `@weft/core` as a transport-agnostic
`WeftService`. Three thin adapter layers consume it:

```
┌─────────────────────────────────────────────────────┐
│                    @weft/core                       │
│                                                     │
│  WeftService                                        │
│  ├── search(query) → results                        │
│  ├── traverse(nodeId, direction) → linked nodes     │
│  ├── read(nodeId, anchor?) → content                │
│  ├── write(nodeId, content) → void                  │
│  ├── authorLink(from, to, type) → void              │
│  ├── appendDecisionLog(nodeId, entry) → void        │
│  ├── analyze(options) → report                      │
│  └── watch(callback) → unsubscribe                  │
│                                                     │
│  Graph model, link parsing, anchor registry,        │
│  manifest builder, import pipeline, analyzers       │
└──────────┬──────────────┬──────────────┬────────────┘
           │              │              │
     ┌─────┴─────┐  ┌────┴────┐  ┌──────┴──────┐
     │  @weft/ui  │  │@weft/mcp│  │  @weft/cli  │
     │            │  │         │  │             │
     │ SvelteKit  │  │  stdio  │  │  direct     │
     │ server     │  │  MCP    │  │  calls      │
     │ routes →   │  │  tools →│  │  →          │
     │ WeftService│  │  Weft.. │  │  WeftService│
     └────────────┘  └─────────┘  └─────────────┘
```

Each consumer instantiates its own `WeftService` from the project config. The graph is
derived from the filesystem — no shared mutable state between processes.

---

## Repository Structure

```
weft/
├── packages/
│   ├── core/          # WeftService, graph model, link parsing, manifest builder,
│   │                  # anchor registry, import pipeline, analyzers
│   ├── ui/            # SvelteKit app — browser UI + API server routes
│   ├── cli/           # CLI commands (weft serve / import / check / analyze / build)
│   ├── mcp/           # MCP server (stdio transport, tool definitions)
│   └── vscode/        # VSCode extension (webview panel, gutter decorations)
├── doc/               # Weft's own documentation (eats its own dog food)
├── weft.config.ts     # Example config
└── package.json
```

---

## Docs Directory Layout

```
docs/
├── architecture.md
├── api.yaml
├── db-schema.md
├── slides/
│   ├── overview.html          # Converted from PPTX/Google Slides
│   └── overview.pptx.weft     # Sidecar: links authored via UI
├── wireframes/
│   ├── dashboard.png          # Imported Figma frame
│   └── dashboard.png.weft     # Sidecar: links authored via UI
└── .weft/
    └── manifest.json          # Derived index — never hand-edited
```

---

## Configuration

`weft.config.ts` at repo root:

```typescript
import { defineConfig } from 'weft';

export default defineConfig({
  docsDir: 'docs',           // default
  entryPoint: 'docs/README.md',
  ignore: ['docs/archive/**'],
  templates: {},             // custom document templates
  mcp: {                     // MCP server options
    readOnly: false,
  },
});
```

---

## File Watching

During `weft serve`, SvelteKit/Vite's built-in file watcher (chokidar under the hood) handles
doc file changes — triggers manifest rebuild and pushes updates to the browser via WebSocket.
No separate watcher needed. For CLI commands that need file watching outside of `weft serve`,
chokidar is available as a transitive dependency from Vite. No new dependency either way.

---

## Graph Manifest

Auto-generated at `docs/.weft/manifest.json`. Rebuilt by `weft index` and on file
watch during `serve`. Never hand-edited.

```json
{
  "version": 1,
  "nodes": [
    {
      "id": "docs/architecture.md",
      "type": "markdown",
      "title": "Architecture Overview",
      "anchors": ["#overview", "#data-flow", "#db-schema"]
    },
    {
      "id": "docs/api.yaml",
      "type": "openapi",
      "title": "API Reference",
      "anchors": ["#/paths/users/get", "#/components/schemas/User"]
    }
  ],
  "edges": [
    {
      "from": { "node": "docs/architecture.md", "anchor": "#data-flow" },
      "to": { "node": "docs/api.yaml", "anchor": "#/paths/users/get" },
      "type": "references",
      "label": "User listing endpoint"
    }
  ]
}
```

---

## Link Syntax (Embedded)

Links are embedded in source files. The manifest is derived from these — not the other way
around. Users author links via the UI; these are the serialization formats.

| Format | Syntax | Anchor unit |
|---|---|---|
| Markdown | `[label](@doc:path/to/doc#anchor)` | Heading slug |
| Code comment | `@doc path/to/doc#anchor` | Any anchor |
| OpenAPI | `x-doc: path/to/doc#anchor` | Per operation or schema |
| HTML slides | `data-doc="path/to/doc#anchor"` on any element | Any element with attribute |
| Sidecar YAML | See sidecar schema below | Slide/page index or named region |

All paths are relative to repo root.

### Sidecar Schema (`<file>.weft`)

YAML format (DD-7). Used for binary and converted-format sources where embedding links in
the source is not possible (PPTX, PDF, Figma).

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

annotations:
  - anchor: slide-2
    author: wil
    created: 2025-03-19
    body: This slide understates the caching layer complexity.
```

---

## Import Pipeline

Each importer lives in `packages/core/src/importers/`. Importers implement a common interface:

```typescript
interface Importer {
  accepts(filePath: string): boolean;
  import(filePath: string, docsDir: string): Promise<ImportResult>;
}

interface ImportResult {
  convertedPath: string;   // path to output artifact in docs/
  sidecarPath?: string;    // path to .weft sidecar if created
  anchors: string[];       // extracted anchor IDs
}
```

### Re-import Behavior
On re-import of an existing artifact:
1. Re-convert source to output format
2. Load existing sidecar (if present)
3. Re-match sidecar links by slide/page index
4. Flag links whose target slide/page no longer exists as broken (do not drop silently)
5. Write updated sidecar

---

## Anchor Registry

Built by `packages/core/src/anchors/` during indexing. Per-format extractors:

- **Markdown:** Extract `## Heading` → slug via same algorithm as GitHub (`#my-heading`)
- **OpenAPI:** Extract operation IDs and schema names from parsed spec
- **HTML slides:** Extract `id` attributes on slide container elements
- **PDF:** Extract page numbers as anchors (`#page-3`); text extraction for search
- **Code files:** Extract function/class names; line ranges for `@doc` references

---

## UI Architecture

No graph overview visualization (DD-3). The graph is the engine, not the interface. The
primary UI is a split-pane document browser with search and a linked-items sidebar.

### Split Pane
- Two independent pane components, each with its own navigation stack
- Clicking a link in the active pane loads the target in the inactive pane (or same pane with
  Cmd/Ctrl+click for same-pane navigation)
- Navigation stack: push on navigate, pop on Back, breadcrumb display

### Linked-Items Sidebar
- Shows documents and anchors related to the current view
- Populated by traversing graph edges from the active document/anchor
- Click an item to load it in the opposite pane

### Document Renderers
One renderer component per document type, registered in a renderer registry.
All renderers expose a link-click callback that the split pane handles — renderers don't
know about pane management. Renderers wrap vanilla JS libraries via Svelte `use:action`
directives where appropriate (pdf.js, Mermaid SVG, Redoc/Stoplight web components, Shiki).

### Link Authoring UI
- Triggered by text selection in any renderer
- Floating toolbar: "Add link" button
- Opens a command-palette-style picker: search documents and anchors
- On confirm: sends write request to SvelteKit API route, which updates the source file
  or sidecar
- Renderer re-fetches and re-renders

---

## VSCode Extension

### Side Panel
- VS Code Webview panel hosting the Weft UI (same Svelte app, different entry point)
- Launched via command: `Weft: Open`
- Communicates with local Weft server (must be running) or spawns its own if not

### Gutter Decorations
- On file open/change: scan for `@doc` comment patterns via regex
- Register `DecorationOptions` with hover message and click command
- Click command: posts message to webview panel to navigate to referenced anchor

### Communication
- Extension ↔ Webview: VS Code message passing API
- Webview ↔ Weft server: standard HTTP/WebSocket to localhost

---

## MCP Server

Separate process (`packages/mcp/`), stdio transport. Tool definitions are thin adapters
over `WeftService` methods:

- `weft_search` → `service.search(query)`
- `weft_read` → `service.read(nodeId, anchor?)`
- `weft_traverse` → `service.traverse(nodeId, direction)`
- `weft_write` → `service.write(nodeId, content)`
- `weft_link` → `service.authorLink(from, to, type)`
- `weft_log` → `service.appendDecisionLog(nodeId, entry)`
- `weft_analyze` → `service.analyze(options)`

Does not depend on `weft serve` running — instantiates its own `WeftService` from the
project config.

---

## CLI Commands

```
weft serve              Start SvelteKit server + open browser UI (default port 7777)
weft import <path>      Import and convert an artifact into docs/
weft index              Rebuild manifest from embedded links (no server)
weft check              Validate all links; report broken anchors; exit 1 if any broken
weft check --staleness  Also flag docs whose linked code has changed
weft analyze            Graph analysis: coverage gaps, orphaned docs, staleness, connectivity
weft build              Render graph to static site for hosting
weft new <template>     Scaffold a new document from a template
weft log                Append a decision log entry to a document node
```

---

## Development Phases

### Phase 1 — Core graph + Markdown
- `packages/core`: WeftService, manifest builder, Markdown link parser, anchor extractor
- `packages/cli`: `serve` and `index` commands
- `packages/ui`: SvelteKit app — split pane, linked-items sidebar, Markdown renderer, search
- No import pipeline yet — Markdown and OpenAPI YAML only

### Phase 2 — Import pipeline + additional renderers
- PPTX → HTML (LibreOffice)
- Google Slides → HTML (export API)
- Mermaid/PlantUML → SVG
- PDF renderer (pdf.js)
- Sidecar format + re-import merge logic

### Phase 3 — Link authoring UI
- Text selection → link picker → write-back per format
- Sidecar authoring for converted formats

### Phase 4 — MCP server
- `packages/mcp`: tool definitions over WeftService
- stdio transport, queryable by AI agents

### Phase 5 — VSCode extension
- Side panel webview (Svelte app, different entry point)
- Gutter decorations for `@doc` references

### Phase 6 — Annotation system + decision log
- Annotation document type
- Sidecar annotation schema
- Decision log format and `weft log` command
- Annotation renderer in split pane

### Phase 7 — Analysis + CI integration
- `weft analyze`: coverage, staleness, orphaned docs, connectivity
- `weft check --staleness` for CI
- Static export via `weft build`

### Phase 8 — Figma integration
- Figma REST API importer
- Frame-level anchors and overlay links
