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
| Google Slides rendering | Custom Svelte components | Slides API JSON, element-level anchors (DD-13) |
| PDF rendering | pdf.js | In-browser canvas render |
| Mermaid rendering | @mermaid-js/mermaid-cli | SVG output at import time |
| OpenAPI rendering | Custom Svelte components | Parsed spec + Shiki for examples (DD-12) |
| Syntax highlighting | Shiki | Code file renderer |
| Test runner | Vitest | Shares Vite transform pipeline (DD-11) |
| CLI parsing | cleye | Flat commands, typed args (DD-10) |
| Package manager | pnpm | Monorepo workspace (DD-9) |
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
│   ├── overview.json          # Cached Google Slides API JSON
│   ├── overview.json.weft     # Sidecar: links authored via UI
│   └── images/                # Cached image assets referenced by slides
│       └── shape-abc123.png
├── diagrams/
│   └── data-flow.svg          # Converted from Mermaid/PlantUML
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
| Google Slides | Sidecar YAML (see schema below) | Element ID from Slides API |
| Sidecar YAML | See sidecar schema below | Slide/page index or element ID |

All paths are relative to repo root.

### Sidecar Schema (`<file>.weft`)

YAML format (DD-7). Used for sources where embedding links in the source is not possible
(Google Slides, PDF).

```yaml
# overview.json.weft
source: https://docs.google.com/presentation/d/1abc123/edit
cached: docs/slides/overview.json

links:
  - anchor: element-abc123       # Element ID from Slides API
    slide: slide-004
    target: docs/api.yaml#/paths/users/get
    type: references
    label: User API

annotations:
  - anchor: slide-002
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
- **Google Slides:** Extract element IDs from cached Slides API JSON; slide IDs as parent anchors
- **PDF:** Extract page numbers as anchors (`#page-3`); text extraction for search
- **Code files:** Extract function/class names; line ranges for `@doc` references

---

## UI Architecture

No graph overview visualization (DD-3). The graph is the engine, not the interface.
Three-panel layout: left-hand nav (LHN), main view pane, linked-items sidebar (RHS).
Two specialized modes alter this layout: **reviewing** and **presenting**.

### Layout — Default Mode

```
┌──────┬───────────────────────────┬────────────┐
│      │                           │  Linked    │
│ LHN  │       Main View           │  Items     │
│      │                           │            │
│ Tree │   (document renderer)     │  (graph    │
│      │                           │   edges)   │
│      │                           │            │
└──────┴───────────────────────────┴────────────┘
```

### Left-Hand Nav (LHN)
- Doc tree: file/folder hierarchy derived from `docsDir`
- Click a node to load it in the main view
- Collapsible; remembers expand/collapse state per session

### Search
- Command-palette overlay (not inline in the LHN)
- Triggered by keyboard shortcut or search icon
- Searches document titles, anchors, and full-text content
- Selecting a result navigates the main view

### Main View Pane
- Single document renderer with its own navigation stack (push on navigate, pop on Back)
- Breadcrumb display for stack history

### Linked-Items Sidebar (RHS)
- Shows documents and anchors related to the current main view
- Populated by traversing graph edges from the active document/anchor

### Cross-Reference Navigation
Configurable behavior when interacting with linked items (RHS sidebar or inline links):

| Config option | Hover | Click | Modifier+Click |
|---|---|---|---|
| `peek-first` (default) | Peek (slide-in modal) | Navigate main view | — |
| `click-direct` | — | Navigate main view | Peek (slide-in modal) |

Config key: `ui.crossRefBehavior` (`"peek-first"` | `"click-direct"`)

### Layout — Reviewing Mode
RHS splits vertically: linked items on top, comment history on bottom.

```
┌──────┬───────────────────────────┬────────────┐
│      │                           │  Linked    │
│ LHN  │       Main View           │  Items     │
│      │                           ├────────────┤
│      │                           │  Comment   │
│      │                           │  History   │
│      │                           │  (scroll)  │
└──────┴───────────────────────────┴────────────┘
```

- Comment history: chronological scrollable list (all annotations for the active doc)
- Not filtered by scroll position — shows full doc history
- Click a comment to jump to its anchor in the main view
- Inline edit/delete on each comment for corrections

### Layout — Presenting Mode
LHN and RHS hidden. Main view fills the viewport. Context is accessed via slide-in modal.

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                  Main View                      │
│                  (full width)                   │
│                                                 │
└─────────────────────────────────────────────────┘
        ↑ slide-in modal overlays from left or right
```

- Toggled explicitly via toolbar button or keyboard shortcut (never auto-engaged)
- Slide-in direction: opposite of the source action's position, so the selection
  point stays visible and content doesn't shift
- Modal has its own independent navigation stack (push/pop/breadcrumb),
  separate from the main view
- Navigating within the modal does not affect the main view

### Document Renderers
One renderer component per document type, registered in a renderer registry.
All renderers expose a link-click callback that the layout shell handles — renderers don't
know about pane or modal management. Renderers wrap vanilla JS libraries via Svelte
`use:action` directives where appropriate (pdf.js, Mermaid SVG, Shiki). OpenAPI and
Google Slides renderers are custom Svelte components (DD-12, DD-13).

### Link Authoring UI
- **Session-only toggle**: disabled by default, user enables it explicitly, resets to
  off on app close (not persisted)
- When enabled: text selection in any renderer shows floating toolbar with "Add link"
- Opens command-palette-style picker: search documents and anchors
- On confirm: sends write request to SvelteKit API route, which updates the source file
  or sidecar
- Renderer re-fetches and re-renders
- Available in all three modes (default, reviewing, presenting)

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

