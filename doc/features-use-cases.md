# DocGraph — Features & Use Cases

## Vision

A documentation graph browser that lives in the repository alongside the code. All project
artifacts — design docs, architecture diagrams, API specs, database schemas, wireframes,
slide decks, functional specs — are nodes in a navigable graph with typed, anchor-level
relationships between them. Any document can be the entry point. Navigation is a first-class
interaction, not an afterthought.

---

## Core Concepts

**Node:** Any document artifact — a Markdown file, an OpenAPI spec, a converted slide deck,
a wireframe, a diagram, a code file, an annotation set.

**Edge:** A typed, directional relationship between two nodes, optionally specifying an
anchor (section, slide, operation, element) on each end. Edge types include: *implements*,
*specifies*, *references*, *see-also*, *annotates*.

**Anchor:** An addressable location within a node — a heading in Markdown, a slide number
in a deck, an operation ID in an OpenAPI spec, a shape ID in a diagram, a line range in code.

**Graph manifest:** A derived index file (auto-generated, never hand-edited) that materializes
all nodes and edges discovered from embedded links across the `docs/` directory and codebase.
Rebuilt on `docgraph serve` and on file watch.

---

## Use Cases

### UC-1: In-repo documentation navigation
A developer opens a terminal in a project repo and runs `docgraph serve`. A browser UI opens
showing the document graph. They can navigate from the high-level design doc to the relevant
API spec section to the database schema to the code file that implements it — all in a split
pane, with each navigation step preserving the history so they can go back.

### UC-2: VSCode side panel
While reading a code file in VSCode, the developer sees gutter annotations where `@doc`
references appear in comments. Clicking an annotation opens the DocGraph side panel directly
to the referenced document section. The panel is navigable — they can follow links within it
without leaving the editor.

### UC-3: Presentation during a call
A developer is presenting an architecture overview (imported from a Google Slides deck) during
a Zoom call. A stakeholder asks about the behavior of a specific API endpoint. The developer
clicks an overlay link on the relevant slide, and the right pane loads the OpenAPI spec section
for that endpoint. They answer the question, dismiss the pane, and continue the presentation
from where they left off.

### UC-4: Document review / annotation
A reviewer receives a zip of project documentation. They drop it in a folder, run
`docgraph serve`, and navigate the graph in the browser. They select a paragraph in the
architecture doc, add a comment, and optionally link the comment to a related section elsewhere
("see also: api.yaml#/paths/users"). The tool writes the annotation to a
`architecture.md.docgraph` sidecar file. The reviewer sends back that file (or the whole
`docs/` folder). The original author drops it in, runs `docgraph serve`, and sees the
annotations in context with the referenced sections in the opposite pane.

### UC-5: Onboarding a new team member
A new developer runs `docgraph serve` on day one. Starting from the README or a designated
entry-point doc, they can explore the full project graph — following links from design intent
to implementation to API contract to database schema — without needing a guided tour.

### UC-6: Stakeholder review without code access
A non-technical stakeholder receives a `docs/` folder export. They run `docgraph serve`
(or a future hosted version) and can navigate the design documents, wireframes, and functional
specs without access to the codebase.

---

## Feature List

### Import Pipeline
- Import PPTX → normalized HTML (LibreOffice headless conversion), stored in `docs/`
- Import Google Slides → HTML (via Slides export API)
- Import PDF → page images + extracted text, stored in `docs/`
- Import Figma file → per-frame PNG/SVG (via Figma REST API), stored in `docs/`
- Import Mermaid/PlantUML → rendered SVG, source preserved
- Re-import: merge existing sidecar links back by slide/page index; flag broken links on
  deleted pages, do not silently drop them
- CLI: `docgraph import <file-or-url>`

### Graph Browser UI
- Split pane layout (primary): left pane + right pane, each independently navigable
- Navigation history per pane (back/forward)
- Graph overview mode: visual node graph showing documents and their relationships
- Click any edge/link to load the target in the opposite pane
- Keyboard navigation (arrow keys, Escape to dismiss overlay, Back/Forward)
- Search across all documents (full text + anchor names)
- Broken link detection and visual flagging

### Document Renderers
- Markdown: rendered with heading anchors
- OpenAPI/Swagger YAML/JSON: interactive API explorer (operations, schemas, examples)
- HTML slides (converted): slide-per-page view with overlay link layer
- Mermaid/PlantUML: rendered SVG with clickable shapes (where shape IDs are defined)
- PDF: pdf.js canvas render per page
- Figma frames: image display with overlay link layer
- Code files: syntax-highlighted view with `@doc` reference highlights
- Annotation documents: rendered alongside their target document in split pane

### Link Authoring
- Select any text/element in any renderer → invoke link picker
- Link picker: search/browse all documents and their anchors
- Tool writes link syntax into source file (text formats) or sidecar (binary/converted formats)
- Users never need to write link syntax manually

### Annotation System
- Annotation document type: structured YAML/Markdown, references anchors in target documents
- Comments can contain links to other graph nodes
- Stored as `<file>.docgraph` sidecar, portable alongside the target document
- Rendered in split pane: annotation on one side, referenced section on the other
- Author attribution, timestamp

### VSCode Plugin
- Gutter decorations on lines/comments containing `@doc` references
- Click gutter icon → open DocGraph side panel to referenced anchor
- Side panel is fully navigable (not just a static preview)
- Panel persists across file navigation; tracks current position in graph

### CLI
- `docgraph serve` — start local server, open browser UI
- `docgraph import <file>` — import and convert an artifact into `docs/`
- `docgraph index` — rebuild graph manifest without serving
- `docgraph check` — validate all links, report broken anchors

### Configuration
- `docgraph.config.ts` at repo root
- Configurable docs directory (default: `docs/`)
- Configurable entry point document
- Ignored paths

---

## Non-Goals (v1)
- Real-time collaboration (multiple users navigating simultaneously)
- Hosted/cloud version
- Auto-inferred relationships (all links are explicitly authored)
- Mobile layout
