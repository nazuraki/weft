# Weft — Development Plan

## Phase 1 — Core graph + Markdown
- `packages/core`: WeftService, manifest builder, Markdown link parser, anchor extractor
- `packages/cli`: `serve` and `index` commands
- `packages/ui`: SvelteKit app — split pane, linked-items sidebar, Markdown renderer, search
- No import pipeline yet — Markdown and OpenAPI YAML only

## Phase 2 — Import pipeline + additional renderers
- Google Slides → custom Svelte renderer via Slides API JSON (DD-13)
- Mermaid/PlantUML → SVG
- PDF renderer (pdf.js)
- Sidecar format + re-import merge logic

## Phase 3 — Link authoring UI
- Text selection → link picker → write-back per format
- Sidecar authoring for converted formats

## Phase 4 — MCP server
- `packages/mcp`: tool definitions over WeftService
- stdio transport, queryable by AI agents

## Phase 5 — VSCode extension
- Side panel webview (Svelte app, different entry point)
- Gutter decorations for `@doc` references

## Phase 6 — Annotation system + decision log
- Annotation document type
- Sidecar annotation schema
- Decision log format and `weft log` command
- Annotation renderer in split pane

## Phase 7 — Analysis + CI integration
- `weft analyze`: coverage, staleness, orphaned docs, connectivity
- `weft check --staleness` for CI
- Static export via `weft build`

---

## Future work
- **Figma integration** — Figma REST API importer, frame-level anchors and overlay links.
  Similar approach to Google Slides (DD-13): parse the Figma JSON, render with custom
  Svelte components, element-level anchors.
- **PPTX support** — requires LibreOffice or a JS rendering approach. Deferred until
  demand is clearer.
