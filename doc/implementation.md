# Weft — Implementation

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript | Throughout — CLI, server, UI, VSCode plugin |
| UI framework | React + Vite | Graph browser web app |
| Graph visualization | React Flow | Node graph overview mode |
| Local server | Node + Express (or Hono) | Serves UI and API; started via CLI |
| VSCode plugin | VS Code Extension API | Webview panel + gutter decorations |
| PPTX conversion | LibreOffice headless | Subprocess via CLI wrapper |
| PDF rendering | pdf.js | In-browser canvas render |
| Mermaid rendering | @mermaid-js/mermaid-cli | SVG output at import time |
| OpenAPI rendering | Redoc or Stoplight Elements | Embedded in renderer pane |
| Package manager | pnpm | Monorepo workspace |
| Monorepo structure | pnpm workspaces | packages: core, ui, cli, vscode |

---

## Repository Structure

```
weft/
├── packages/
│   ├── core/          # Graph model, link parsing, manifest builder, import pipeline
│   ├── ui/            # React browser app (graph browser, renderers, split pane)
│   ├── cli/           # weft serve / import / index / check commands
│   └── vscode/        # VSCode extension (webview, gutter decorations)
├── docs/              # Weft's own documentation (eats its own dog food)
├── weft.config.ts # Example config
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
│   └── overview.pptx.weft # Sidecar: links authored via UI
├── wireframes/
│   ├── dashboard.png          # Imported Figma frame
│   └── dashboard.png.weft # Sidecar: links authored via UI
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
});
```

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
| Sidecar JSON | See sidecar schema below | Slide/page index or named region |

All paths are relative to repo root.

### Sidecar Schema (`<file>.weft`)

Used for binary and converted-format sources where embedding links in the source is not possible
(PPTX, PDF, Figma).

```json
{
  "source": "docs/slides/overview.pptx",
  "converted": "docs/slides/overview.html",
  "links": [
    {
      "anchor": "slide-4",
      "elementSelector": "#slide-4 .shape-3",
      "target": "docs/api.yaml#/paths/users/get",
      "type": "references",
      "label": "User API"
    }
  ],
  "annotations": [
    {
      "anchor": "slide-2",
      "author": "wil",
      "created": "2025-03-19T00:00:00Z",
      "body": "This slide understates the caching layer complexity."
    }
  ]
}
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

### Split Pane
- Two independent `<PaneView>` components, each with its own navigation stack
- Clicking a link in the active pane loads the target in the inactive pane (or same pane with
  Cmd/Ctrl+click for same-pane navigation)
- Navigation stack: push on navigate, pop on Back, breadcrumb display

### Document Renderers
One renderer component per document type, registered in a renderer registry:

```typescript
interface Renderer {
  accepts(node: GraphNode): boolean;
  component: React.ComponentType<{ node: GraphNode; onLinkClick: (target: LinkTarget) => void }>;
}
```

All renderers expose an `onLinkClick` callback that the split pane handles — renderers don't
know about pane management.

### Graph Overview
React Flow canvas showing all nodes and edges. Clicking a node opens it in a pane. Edge
labels show relationship type. Node color/shape encodes document type.

### Link Authoring UI
- Triggered by text selection in any renderer
- Floating toolbar: "Add link" button
- Opens a command-palette-style picker: search documents and anchors
- On confirm: sends write request to local server, which updates the source file or sidecar
- Renderer re-fetches and re-renders

---

## VSCode Extension

### Side Panel
- VS Code Webview panel hosting the Weft UI (same React app, different entry point)
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
weft serve            Start local server + open browser UI (default port 7777)
weft import <path>    Import and convert an artifact into docs/
weft index            Rebuild manifest from embedded links (no server)
weft check            Validate all links; report broken anchors; exit 1 if any broken
```

---

## Development Phases

### Phase 1 — Core graph + Markdown
- `packages/core`: manifest builder, Markdown link parser, anchor extractor
- `packages/cli`: `serve` and `index` commands
- `packages/ui`: split pane, Markdown renderer, graph overview (React Flow)
- No import pipeline yet — Markdown and OpenAPI YAML only

### Phase 2 — Import pipeline
- PPTX → HTML (LibreOffice)
- Google Slides → HTML (export API)
- Mermaid/PlantUML → SVG
- PDF renderer (pdf.js)
- Sidecar format + re-import merge logic

### Phase 3 — Link authoring UI
- Text selection → link picker → write-back per format
- Sidecar authoring for converted formats

### Phase 4 — VSCode extension
- Side panel webview
- Gutter decorations for `@doc` references

### Phase 5 — Annotation system
- Annotation document type
- Sidecar annotation schema
- Annotation renderer in split pane

### Phase 6 — Figma integration
- Figma REST API importer
- Frame-level anchors and overlay links
