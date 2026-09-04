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
├── weft.config.yaml   # Example config
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

`weft.config.yaml` at repo root:

```yaml
docsDir: docs                # default
entryPoint: docs/README.md
ignore:
  - docs/archive/**
```

---

## File Watching

During `weft serve`, `WeftService.watch()` (chokidar) rebuilds the manifest when a doc changes,
in both UI modes. With `--dev`, Vite additionally hot-reloads the UI source itself.

---

## Graph Manifest

Auto-generated at `docs/.weft/manifest.json`. Rebuilt by `weft index` and on file
watch during `serve`. Never hand-edited.

```json
{
  "version": 2,
  "build": {
    "builtAt": "2026-08-01T14:32:07.418Z",
    "inputsHash": "7f3a1c9e02b4d681"
  },
  "nodes": [
    {
      "id": "docs/architecture.md",
      "type": "markdown",
      "title": "Architecture Overview",
      "contentHash": "9f2b4c1a7d3e5086",
      "lineCount": 214,
      "anchors": [
        { "slug": "#overview", "text": "Overview", "line": 3, "level": 2 },
        { "slug": "#data-flow", "text": "Data Flow", "line": 41, "level": 2 }
      ]
    },
    {
      "id": "docs/api.yaml",
      "type": "openapi",
      "title": "API Reference",
      "contentHash": "3c81e05fa9b26d47",
      "lineCount": 96,
      "anchors": [
        { "slug": "#/paths/users/get", "text": "GET /users" },
        { "slug": "#/components/schemas/User", "text": "User" }
      ]
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

## Manifest Freshness

`build` is optional and absent from a manifest written by an older Weft — nothing
reads it as an error, and `WeftService.freshness()` reports `unknown` rather than
guessing about provenance that was never recorded.

**`builtAt`** — ISO 8601 timestamp of the build.

**`inputsHash`** — a baseline hash of everything the manifest's own nodes cannot
already tell you changed: the sorted set of indexed file paths across every docs
root, plus the content of every input that is not itself a node — sidecar `.weft`
files, contribution files, and the config files, including the
`weft.config.local.yaml` overlay. The indexed path set honours the `extensions`
config, so a project that opted extra extensions in has those files in the
baseline too. Every node already carries a
`contentHash`, so an edited document's content is deliberately left out of this
hash; re-hashing it here would duplicate what the node already records. Excludes
`.weft/` itself, the same way the chokidar watcher does, so writing the manifest
never makes it look stale to itself.

**Computed from content, never mtime.** Git does not preserve modification times,
so a fresh clone or a CI checkout would otherwise make every file look
simultaneously changed — the same reasoning that already rules mtime out for
`node.modified` and artifact staleness elsewhere in this document.

`WeftService.freshness(): Promise<Freshness>` compares the current tree against
the recorded `build` block:

| Status | Meaning |
|---|---|
| `fresh` | The inputs hash matches, and every node's re-read content still matches its `contentHash` |
| `stale` | A document was added, removed, or edited, or a non-node input changed |
| `unknown` | The manifest has no `build` block to compare against |

Confirming that nothing was edited means reopening and rehashing every document,
so the result is cached for 2 seconds — long enough that a burst of calls inside
one agent turn lands within it, short enough that a human edit is visible on the
next turn rather than the next minute. Concurrent cache misses coalesce onto a
single re-read, and a check overtaken by a `rebuild()` is returned to its caller
but never cached over the rebuild's state. `rebuild()` invalidates the cache
immediately and computes a fresh `build` block; it is the only way the manifest
refreshes outside `weft serve`'s own file watcher.

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

## Computed Node Properties

Captured in `buildRootGraph` while each file is already in hand, so nothing has to re-read the docs tree to get them.

| Field | Description |
|-------|-------------|
| `contentHash` | Content hash of the document, covering frontmatter as well as body |
| `lineCount` | Lines of text, counted the way `wc -l` and an editor agree: a trailing newline terminates the last line rather than starting an empty one |

Both are optional on `WeftNode`. A node that was not indexed from a text file — one declared by an external build tool, or a binary artifact — may legitimately have neither.

**The hash normalizes before hashing:** a leading BOM is stripped and CRLF becomes LF, then SHA-256, keeping the first 16 hex characters. Raw-byte hashing would report every document as changed the moment CI checked it out with different line endings from the working tree that produced it — the same reason modification time is not used for staleness. The recipe is documented rather than internal precisely so a build tool can declare a hash it computed itself instead of having Weft recompute it.

Deliberately absent: **modification time**, which git does not preserve, so a fresh clone makes every file look simultaneously modified. A date worth checking has to come from git history or be declared explicitly. **File size** is also absent — no check needs it, and it would be ambiguous next to a hash that normalizes line endings.

---

## Anchor Registry

Built by `packages/core/src/anchors/` during indexing. Per-format extractors:

- **Markdown:** Parse with `remark`, then slug each heading's rendered text via `github-slugger`, the implementation GitHub itself uses (`#my-heading`). Both ATX (`## Heading`) and setext headings are found; a `#` inside a fenced code block is a code node, not a heading, so it gets no anchor
- **OpenAPI:** Extract operation IDs and schema names from parsed spec
- **Code files:** Extract function/class names; line ranges for `@doc` references

### Anchors and Rendered Ids Are One Algorithm

An anchor is only useful if the rendered page carries an element with that id — otherwise it is extracted, indexed, stored and offered as a UI affordance while doing nothing.

The renderer adds `rehype-slug`, which slugs with `github-slugger`. The indexer slugs the same parsed heading with the same library, so the two agree by construction rather than by being kept in step:

- **The input is the heading's rendered text, not its source line.** `## See [the docs](guide.md)` renders as "See the docs", so its id is `#see-the-docs`. Slugging the raw line would give `#see-the-docsguidemd`, and no id in the page would ever match it. GitHub slugs what it rendered, and so does Weft.
- **Collision suffixes belong to `github-slugger`**, which both sides instantiate per document, so a repeated heading gets `-1`, `-2` identically on each.
- **OpenAPI ids come from `openApiOperationAnchor` and `openApiSchemaAnchor`**, exported from `@weft/core/browser` and called by both the extractor and `OpenApiRenderer`, for the same reason.

`packages/ui/src/lib/markdown.test.ts` renders fixtures — and this repo's own documents — and asserts that every anchor the indexer records resolves to an element id in the output.

Each anchor is an object, not a bare slug:

| Field | Present for | Description |
|-------|-------------|-------------|
| `slug` | all | URL fragment including `#`, the only field an edge matches on |
| `text` | all | Source text the slug came from — the heading, or the operation id / schema name |
| `line` | markdown | 1-based line in the source file |
| `level` | markdown | Heading level, 1-6 |

`text` is what makes a renamed heading distinguishable from a deleted one: a slug that vanished while its text survives elsewhere is a rename, and a validation rule can suggest the new target rather than only reporting breakage.

Slugs come from `github-slugger` rather than a local approximation because links are authored to render on GitHub (DD-2), which makes GitHub's slugs the correct ones. Approximating it diverged on any heading with punctuation between words (`React + Vite` → `#react--vite`, not `#react-vite`) and dropped non-ASCII letters entirely, slugging a CJK heading to the empty string.

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
weft serve              Serve the built UI + data API (default port 7777); --dev serves the
                        UI source through Vite with hot reload
weft index              Rebuild manifest from embedded links (no server)
weft check              Validate all links; report broken anchors; exit 1 if any broken
weft check --staleness  Also flag docs whose linked code has changed
weft analyze            Graph analysis: coverage gaps, orphaned docs, staleness, connectivity
weft build              Render graph to static site for hosting
weft new <template>     Scaffold a new document from a template
weft log                Append a decision log entry to a document node
```

