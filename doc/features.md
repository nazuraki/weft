# Weft — Features

## Import Pipeline
- Import PPTX → normalized HTML (LibreOffice headless conversion), stored in `docs/`
- Import Google Slides → HTML (via Slides export API)
- Import PDF → page images + extracted text, stored in `docs/`
- Import Figma file → per-frame PNG/SVG (via Figma REST API), stored in `docs/`
- Import Mermaid/PlantUML → rendered SVG, source preserved
- Re-import: merge existing sidecar links back by slide/page index; flag broken links on
  deleted pages, do not silently drop them
- CLI: `weft import <file-or-url>`

## Graph Browser UI
- Split pane layout (primary): left pane + right pane, each independently navigable
- Navigation history per pane (back/forward)
- Graph overview mode: visual node graph showing documents and their relationships
- Click any edge/link to load the target in the opposite pane
- Keyboard navigation (arrow keys, Escape to dismiss overlay, Back/Forward)
- Search across all documents (full text + anchor names)
- Broken link detection and visual flagging

## Document Renderers
- Markdown: rendered with heading anchors
- OpenAPI/Swagger YAML/JSON: interactive API explorer (operations, schemas, examples)
- HTML slides (converted): slide-per-page view with overlay link layer
- Mermaid/PlantUML: rendered SVG with clickable shapes (where shape IDs are defined)
- PDF: pdf.js canvas render per page
- Figma frames: image display with overlay link layer
- Code files: syntax-highlighted view with `@doc` reference highlights
- Annotation documents: rendered alongside their target document in split pane

## Link Authoring
- Select any text/element in any renderer → invoke link picker
- Link picker: search/browse all documents and their anchors
- Tool writes link syntax into source file (text formats) or sidecar (binary/converted formats)
- Users never need to write link syntax manually

## Annotation System
- Annotation document type: structured YAML/Markdown, references anchors in target documents
- Comments can contain links to other graph nodes
- Stored as `<file>.weft` sidecar, portable alongside the target document
- Rendered in split pane: annotation on one side, referenced section on the other
- Author attribution, timestamp

## VSCode Plugin
- Gutter decorations on lines/comments containing `@doc` references
- Click gutter icon → open Weft side panel to referenced anchor
- Side panel is fully navigable (not just a static preview)
- Panel persists across file navigation; tracks current position in graph

## CLI
- `weft serve` — start local server, open browser UI
- `weft import <file>` — import and convert an artifact into `docs/`
- `weft index` — rebuild graph manifest without serving
- `weft check` — validate all links, report broken anchors

## Configuration
- `weft.config.ts` at repo root
- Configurable docs directory (default: `docs/`)
- Configurable entry point document
- Ignored paths

---

## Non-Goals (v1)
- Real-time collaboration (multiple users navigating simultaneously)
- Hosted/cloud version
- Auto-inferred relationships (all links are explicitly authored)
- Mobile layout
