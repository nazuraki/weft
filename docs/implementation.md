# Weft — Implementation

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript | All packages — core, UI, CLI, VSCode (DD-1) |
| Runtime | Node (default), Bun (optional) | Bun via optional `weft-bun-<arch>` package (DD-1) |
| UI framework | Svelte 5 + Vite | Compiler-based, no runtime overhead (DD-2) |
| Server | SvelteKit + adapter-node | UI and API in one process (DD-5) |
| VSCode extension | VS Code Extension API | Webview panel + gutter decorations |
| OpenAPI rendering | Custom Svelte components | Parsed spec + Shiki for examples (DD-12) |
| Syntax highlighting | Shiki | Code file renderer |
| Test runner | Vitest | Shares Vite transform pipeline (DD-11) |
| CLI parsing | cleye | Flat commands, typed args (DD-10) |
| Package manager | pnpm | Monorepo workspace (DD-9) |
| License | MIT | Open source (DD-8) |

---

## Architecture

Ports-and-adapters (DD-5). All business logic lives in `@weft/core` as a transport-agnostic
`WeftService`. Thin adapter layers consume it:

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
│  manifest builder, analyzers                        │
└──────────┬─────────────────────────┬────────────────┘
           │                         │
     ┌─────┴─────┐            ┌──────┴──────┐
     │  @weft/ui  │            │  @weft/cli  │
     │            │            │             │
     │ SvelteKit  │            │  direct     │
     │ server     │            │  calls      │
     │ routes →   │            │  →          │
     │ WeftService│            │  WeftService│
     └────────────┘            └─────────────┘
```

Each consumer instantiates its own `WeftService` from the project config. The graph is
derived from the filesystem — no shared mutable state between processes.

**`traverse(nodeId, direction)`:** `direction` is one of `outbound` (edges from this node),
`inbound` (edges to this node), or `both`, for listing linked documents/anchors in the UI and
for analysis.

---

## Repository Structure

```
weft/
├── packages/
│   ├── core/          # WeftService, graph model, link parsing, manifest builder,
│   │                  # anchor registry, analyzers
│   ├── ui/            # SvelteKit app — browser UI + API server routes
│   ├── cli/           # CLI commands (weft serve / check / analyze / build)
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
| Markdown | `[label](relative/path.md#anchor)` | Heading slug |
| Code comment | `@doc path/to/doc#anchor` | Any anchor |
| OpenAPI | `x-doc: path/to/doc#anchor` | Per operation or schema |
| Sidecar YAML | See sidecar schema below | Format-specific anchor |

Markdown links use standard relative paths — no custom prefix or protocol. This means links
render correctly on GitHub and other Markdown viewers without Weft installed. Weft identifies
graph edges by resolving relative links against the docs directory; any link targeting a file
within the docs tree is treated as a graph edge.

Code comment and OpenAPI paths are relative to repo root.

### Sidecar Schema (`<file>.weft`)

YAML format (DD-7). Used for annotations and for sources where embedding links in the
source is not possible.

```yaml
# architecture.md.weft
links:
  - anchor: "#data-flow"
    target: docs/api.yaml#/paths/users/get
    type: references
    label: User API

annotations:
  - anchor: "#overview"
    author: wil
    created: 2025-03-19
    body: This section understates the caching layer complexity.
```

---

## Anchor Registry

Built by `packages/core/src/anchors/` during indexing. Per-format extractors:

- **Markdown:** Extract `## Heading` → slug via same algorithm as GitHub (`#my-heading`)
- **OpenAPI:** Extract operation IDs and schema names from parsed spec
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
`use:action` directives where appropriate (Shiki). OpenAPI renderer is a custom Svelte
component (DD-12).

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

## CLI Commands

```
weft serve              Start SvelteKit server + open browser UI (default port 7777)
weft index              Rebuild manifest from embedded links (no server)
weft check              Validate all links; report broken anchors; exit 1 if any broken
weft check --staleness  Also flag docs whose linked code has changed
weft analyze            Graph analysis: coverage gaps, orphaned docs, staleness, connectivity
weft build              Render graph to static site for hosting
weft new <template>     Scaffold a new document from a template
weft log                Append a decision log entry to a document node
```

