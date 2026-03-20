# Weft — Features

## Import Pipeline
*Supports: UC-1, UC-3, UC-4, UC-5, UC-14, UC-15*

- Import PPTX → normalized HTML (LibreOffice headless conversion), stored in `docs/`
- Import Google Slides → HTML (via Slides export API)
- Import PDF → page images + extracted text, stored in `docs/`
- Import Figma file → per-frame PNG/SVG (via Figma REST API), stored in `docs/`
- Import Mermaid/PlantUML → rendered SVG, source preserved
- Re-import: merge existing sidecar links back by slide/page index; flag broken links on
  deleted pages, do not silently drop them
- CLI: `weft import <file-or-url>`

## Graph Browser UI
*Supports: UC-1, UC-3, UC-5, UC-10, UC-12, UC-14, UC-15*

- Split pane layout (primary): left pane + right pane, each independently navigable
- Navigation history per pane (back/forward)
- Graph overview mode: visual node graph showing documents and their relationships
- Click any edge/link to load the target in the opposite pane
- Keyboard navigation (arrow keys, Escape to dismiss overlay, Back/Forward)
- Search across all documents (full text + anchor names)
- Broken link detection and visual flagging

## Document Renderers
*Supports: UC-1, UC-2, UC-3, UC-5, UC-6, UC-14, UC-15*

- Markdown: rendered with heading anchors
- OpenAPI/Swagger YAML/JSON: interactive API explorer (operations, schemas, examples)
- HTML slides (converted): slide-per-page view with overlay link layer
- Mermaid/PlantUML: rendered SVG with clickable shapes (where shape IDs are defined)
- PDF: pdf.js canvas render per page
- Figma frames: image display with overlay link layer
- Code files: syntax-highlighted view with `@doc` reference highlights
- Annotation documents: rendered alongside their target document in split pane

## Link Authoring
*Supports: UC-1, UC-4, UC-7, UC-8, UC-10*

- Select any text/element in any renderer → invoke link picker
- Link picker: search/browse all documents and their anchors
- Tool writes link syntax into source file (text formats) or sidecar (binary/converted formats)
- Users never need to write link syntax manually

## Annotation System
*Supports: UC-4, UC-8*

- Annotation document type: structured YAML/Markdown, references anchors in target documents
- Comments can contain links to other graph nodes
- Stored as `<file>.weft` sidecar, portable alongside the target document
- Rendered in split pane: annotation on one side, referenced section on the other
- Author attribution, timestamp

## Decision Log
*Supports: UC-8*

- Structured entry format: what changed, why, alternatives considered, who approved
- Entries linked to affected graph nodes (API spec, schema, architecture doc)
- Navigable history — trace from any artifact to the decisions that shaped it
- Append via UI, CLI (`weft log`), or programmatically via MCP

## Document Templates
*Supports: UC-5, UC-8*

- Scaffolding for common document types: ADR, design doc, API changelog, decision log entry
- CLI: `weft new <template>` creates a new doc from template, pre-linked to relevant graph nodes
- Templates are customizable per project via `weft.config.ts`

## Staleness Detection
*Supports: UC-9, UC-11*

- Detect documentation that is likely stale — not just broken links, but docs whose linked
  code has changed since the doc was last updated
- Compare doc last-modified timestamps against git history of linked code files
- Report staleness as part of `weft analyze` and `weft check --staleness`
- Integrates with CI to flag stale docs on PRs that touch linked code

## Documentation Coverage Analysis
*Supports: UC-11*

- Code files with no `@doc` links (undocumented code)
- Documentation nodes with zero inbound edges (orphaned docs)
- Graph regions with sparse connectivity relative to code complexity
- CLI: `weft analyze --coverage`

## Static Export
*Supports: UC-14, UC-15*

- `weft build` renders the full documentation graph to a static site (HTML + JS)
- Deployable to GitHub Pages, Netlify, S3, or any static hosting
- Full graph browser functionality without a running server
- Supports versioned output directories for multi-version hosting

## Versioned Documentation
*Supports: UC-14*

- View documentation as it existed at a specific release
- `weft serve --repo <org/project> --tag <version>` pulls docs tarball from a GitHub release
- Version selector in browser UI to switch between releases
- Works with static export: `weft build --tag <version>` for versioned hosted sites

## MCP Server
*Supports: UC-6, UC-7, UC-9, UC-13*

- Weft exposes its graph as an MCP server, queryable by AI agents and tools
- Query operations: search nodes, traverse edges, resolve anchors, read document content
- Write operations: update doc content, author links, append decision log entries
- Multiple Weft MCP servers (one per repo) can be queried by a single agent for cross-repo
  discovery and dependency analysis

## VSCode Extension
*Supports: UC-2*

- Gutter decorations on lines/comments containing `@doc` references
- Click gutter icon → open Weft side panel to referenced anchor
- Side panel is fully navigable (not just a static preview)
- Panel persists across file navigation; tracks current position in graph

## CLI
*Supports: UC-1, UC-5, UC-9, UC-11, UC-12, UC-14*

- `weft serve` — start local server, open browser UI
- `weft import <file>` — import and convert an artifact into `docs/`
- `weft index` — rebuild graph manifest without serving
- `weft check` — validate all links, report broken anchors; `--staleness` flag for drift detection
- `weft analyze` — graph analysis: coverage gaps, orphaned docs, staleness, feature↔use-case
  traceability, connectivity reports
- `weft build` — render graph to static site for hosting
- `weft new <template>` — scaffold a new document from a template
- `weft log` — append a decision log entry to a document node

## Configuration
*Supports: all use cases*

- `weft.config.ts` at repo root
- Configurable docs directory (default: `docs/`)
- Configurable entry point document
- Ignored paths
- Custom document templates
- MCP server options (port, auth, read-only mode)

---

## Non-Goals (v1)
- Real-time collaboration (multiple users navigating simultaneously)
- Auto-inferred relationships (all links are explicitly authored)
- Mobile layout
