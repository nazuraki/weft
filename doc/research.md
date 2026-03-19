# DocGraph — Research

## Problem Statement

Technical projects accumulate heterogeneous documentation artifacts: high-level design docs,
architecture diagrams, database schemas, API specs, wireframes, functional specs, and source
code. These artifacts are authored in different tools, stored in different places, and have no
structured awareness of each other. Navigating between them during development, review, or a
presentation requires tab-switching, manual searching, and significant context loss.

No existing tool treats all artifact types as first-class citizens in a unified, navigable
graph that lives alongside the code.

---

## Existing Tools Survey

### Swimm
- **What it does:** Code-coupled documentation platform. Docs are Markdown files stored in the
  repo. Links reference live code tokens, functions, and snippets. IDE plugin (VS Code,
  JetBrains) shows gutter annotations when code is referenced by a doc.
- **Strengths:** Code↔doc traceability, auto-sync when code changes, IDE-native workflow.
- **Gaps:** Docs only — no architecture diagrams, wireframes, API specs, or slide decks as
  first-class nodes. No inter-document graph. No import pipeline for external artifact formats.
- **URL:** https://swimm.io

### Structurizr
- **What it does:** C4-model architecture diagram tool. Define a single model in DSL; generate
  multiple diagram views (context, container, component). Supports supplementary Markdown/AsciiDoc
  docs and Architecture Decision Records (ADRs).
- **Strengths:** Excellent for hierarchical architecture visualization. Diagrams-as-code.
  Strong C4 model support.
- **Gaps:** Architecture diagrams only. No API specs, wireframes, or code traceability. No
  cross-document link graph.
- **URL:** https://structurizr.com

### Mintlify / Redocly / GitBook
- **What they do:** Documentation portals, primarily for public-facing API and developer docs.
  Rich navigation, OpenAPI rendering, search.
- **Strengths:** Polished UI, good OpenAPI support, CI/CD integration.
- **Gaps:** Text and API specs only. No diagrams, wireframes, or code traceability. No
  cross-document semantic graph. Not designed to live in a repo alongside code.

### Confluence / Notion
- **What they do:** General wiki/knowledge base platforms with hyperlink-based cross-referencing.
- **Strengths:** Flexible, team-familiar, easy to link pages.
- **Gaps:** Hyperlinks only — no typed relationships, no anchor-level linking, no code
  awareness, no local-first/repo-native model, no import pipeline.

### arc42 + docToolchain
- **What it does:** arc42 is a structured template for software architecture documentation.
  docToolchain is a build pipeline (AsciiDoc + Asciidoctor) that exports to HTML, PDF,
  Confluence, GitHub Pages.
- **Strengths:** Docs-as-code philosophy, structured sections, CI/CD friendly.
- **Gaps:** Documentation format/process only — no graph model, no cross-format navigation,
  no IDE integration.

---

## Gap Analysis

The combination of features that doesn't exist in any single tool:

| Capability | Swimm | Structurizr | Portals | DocGraph |
|---|---|---|---|---|
| Lives in repo, versions with code | ✅ | ✅ | ❌ | ✅ |
| Multiple artifact types as first-class nodes | ❌ | ❌ | ❌ | ✅ |
| Typed cross-document links with anchors | ❌ | ❌ | ❌ | ✅ |
| Import pipeline (PPTX, PDF, Figma, etc.) | ❌ | ❌ | ❌ | ✅ |
| IDE side panel integration | ✅ | ❌ | ❌ | ✅ |
| Annotation/review layer | ❌ | ❌ | ❌ | ✅ |
| Split-pane graph browser UI | ❌ | ❌ | ❌ | ✅ |

---

## Prior Art — Related Concepts

- **Docs-as-code:** Treat documentation with the same discipline as source code — version
  control, review process, CI/CD. DocGraph extends this to all artifact types.
- **Living documentation:** Documentation that stays synchronized with the system it describes,
  rather than drifting over time. DocGraph enforces this via embedded links and import-time
  conversion.
- **Bidirectional traceability:** Requirements engineering concept — ability to trace from a
  requirement to its implementation and back. DocGraph generalizes this across all artifact types.
- **Knowledge graphs:** Structured representation of entities and relationships. DocGraph applies
  this model to a project's documentation artifacts.

---

## Conversion Library Research

### PPTX → HTML
- **LibreOffice headless:** `soffice --headless --convert-to html` — most reliable, handles
  complex layouts, produces per-slide HTML with inline styles.
- **pptx2html (npm):** Lighter weight, JS-native, less complete layout support.
- **Recommendation:** LibreOffice for fidelity; wrap in a CLI subprocess from Node.

### Google Slides → HTML
- **Google Slides Export API:** `https://docs.google.com/presentation/d/{id}/export/html` —
  produces clean HTML directly. Requires OAuth for private presentations.

### PDF → navigable format
- **pdf.js:** Renders PDF pages to canvas in-browser. Good for display; limited for
  anchor extraction.
- **pdfminer / pdftotext:** Extract text for search indexing and anchor identification.
- **Strategy:** Render via pdf.js; extract text separately for anchor registry and search.

### Figma → images
- **Figma REST API:** `/v1/images/{fileKey}` returns rendered PNG/SVG per frame. Frames
  become addressable nodes. Requires personal access token.

### Mermaid / PlantUML
- **Mermaid:** `@mermaid-js/mermaid-cli` renders to SVG. Source kept for editability and
  re-rendering.
- **PlantUML:** Java-based renderer; can run headless. SVG output.
