# Weft — Features

Full capability inventory mapped to use cases.

## Browser UI
*Supports: UC-1, UC-3, UC-5, UC-10, UC-12, UC-14, UC-15*

- Three-panel layout: left-hand doc tree (`docsDir`), main document view, right-hand
  **linked-items** sidebar (edges from the active document/anchor)
- Main view has its own navigation stack (back/forward) and breadcrumbs
- **Presenting mode:** chrome minimized; linked context opens in a slide-in modal with its own
  stack (see [implementation.md](implementation.md#layout--presenting-mode))
- **Reviewing mode:** RHS splits — linked items above, comment/annotation history below
- Cross-reference behavior configurable (`peek-first` vs `click-direct`; see implementation.md)
- Command-palette search (full text + anchor names; optional semantic search per DD-6)
- Keyboard navigation (arrow keys, Escape, Back/Forward where applicable)
- Broken link detection and visual flagging

## Document Renderers
*Supports: UC-1, UC-2, UC-3, UC-5, UC-6, UC-14, UC-15*

- Markdown: rendered with heading anchors
- OpenAPI/Swagger YAML/JSON: interactive API explorer (operations, schemas, examples)
- Code files: syntax-highlighted view with `@doc` reference highlights
- Annotation documents: surfaced in **reviewing mode** alongside the target (layout in
  implementation.md)

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
- In reviewing mode, annotations and referenced sections use the split sidebar + main layout
  (see implementation.md)
- Author attribution, timestamp

## Decision Log
*Supports: UC-8*

- Structured entry format: what changed, why, alternatives considered, who approved
- Entries linked to affected graph nodes (API spec, schema, architecture doc)
- Navigable history — trace from any artifact to the decisions that shaped it
- Append via UI or CLI (`weft log`)

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

## VSCode Extension
*Supports: UC-2*

- Gutter decorations on lines/comments containing `@doc` references
- Click gutter icon → open Weft side panel to referenced anchor
- Side panel is fully navigable (not just a static preview)
- Panel persists across file navigation; tracks current position in graph

## CLI
*Supports: UC-1, UC-5, UC-9, UC-11, UC-12, UC-14, UC-15*

- `weft serve` — start local server, open browser UI
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
- Search options (full-text always; optional semantic / embedding provider per DD-6)

---

## Non-Goals (v1)
- Real-time collaboration (multiple users navigating simultaneously)
- Auto-inferred relationships (all links are explicitly authored)
- Mobile layout
