# Configuration

## weft.config.yaml

Place a `weft.config.yaml` (or `.yml` / `.json`) in your project root. The config is plain data — no imports, no code, no dependency on `@weft/core`:

```yaml
docsDir: docs
entryPoint: docs/README.md
siteTitle: My Project
siteUrl: https://docs.example.com
defaultTheme: dark
layout: default
docOrder:
  - README.md
  - architecture.md
  - api.yaml
docOrderStrict: false
ignore:
  - "**/node_modules/**"
  - "**/dist/**"
```

The file is validated at load time: wrong types and bad enum values fail with the offending field named, and unknown keys warn.

> **Migrating from `weft.config.ts`?** JS/TS config files are no longer supported — they required a runtime dependency on `@weft/core` just to be loadable. The option names are identical; rewrite the exported object as YAML and delete the old file.

### All Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `docsDir` | `string` | `"docs"` | Directory to scan for documents, relative to project root. Ignored when `projects` is set |
| `projects` | `WeftProject[]` | — | Multiple docs roots, one per product — see [Multiple Projects](#multiple-projects) |
| `entryPoint` | `string` | `"docs/README.md"` | Default document opened when no path is specified |
| `siteTitle` | `string` | — | Site name used in `og:site_name` and page title (`Doc — Site`) |
| `siteUrl` | `string` | — | Canonical base URL (e.g. `https://docs.example.com`). Required for absolute `og:image` URLs |
| `ogImage` | `string` | — | Default `og:image`. Relative to project root or an absolute URL. Overridden per-document via frontmatter |
| `defaultTheme` | `"light" \| "dark"` | system preference | Theme applied on first visit before the user sets a preference |
| `layout` | `"default" \| "reader"` | `"default"` | `"reader"` hides the linked-items sidebar for a cleaner reading experience |
| `docOrder` | `string[]` | — | Explicit order for docs in the left-hand navigation. Filenames relative to `docsDir` |
| `docOrderStrict` | `boolean` | `false` | When `true`, only docs listed in `docOrder` appear in the LHN. Unlisted docs stay in the graph — see [Strict Ordering](#strict-ordering) |
| `ignore` | `string[]` | `["**/node_modules/**", "**/dist/**"]` | Glob patterns to exclude from indexing |
| `rules` | `Record<string, severity>` | — | Per-rule severity for the validation stage — see [Validation](#validation) |

### Strict Ordering

`docOrderStrict` narrows the left-hand nav, not the graph. A document left out of `docOrder` is marked `hiddenFromNav` in the manifest and skipped by the tree, but it remains a full node: still indexed for search, still reachable by link or URL, and still a valid endpoint for edges pointing at it.

This matters because the two are not interchangeable. Removing those documents from the manifest would leave every edge touching one of them pointing at nothing, so a link from a listed document to an unlisted one would read as broken — including to the validation rules that check whether edges resolve.

---

## Validation

`weft analyze` and `weft check` run a set of registered rules over the built graph and report [diagnostics](usage.md#weft-analyze-root-dir). Each rule has a default severity, which `rules` overrides per project:

```yaml
rules:
  some-check: warn   # report, but do not fail `weft check`
  noisy-check: off   # do not run at all
```

| Severity | Meaning |
|----------|---------|
| `error` | Reported, and fails `weft check` with exit code 1 |
| `warn` | Reported, `weft check` still passes |
| `info` | Reported as a note, `weft check` still passes |
| `off` | The rule does not run |

Run `weft analyze --list-rules` to see the available rule ids and their defaults. An id in `rules` that no rule declares is reported at the end of a run rather than rejected, so a config written against a newer Weft — or against a check supplied by an external tool — still loads.

### Rules

| Rule | Default | Reports |
|------|---------|---------|
| `edge-target-missing` | `error` | A link points at a document that is not in the graph |
| `edge-anchor-missing` | `error` | The target document exists, but defines no such anchor |
| `edge-source-anchor-missing` | `error` | A sidecar declares a source `anchor` its own document does not define |
| `edge-pending` | `info` | A link marked `pending` still does not resolve |
| `edge-pending-resolved` | `info` | A link marked `pending` now resolves, so the marker can be dropped |
| `validator-error` | `error` | A rule threw while running |

A missing document and a missing anchor are separate rules because they usually have different causes and different fixes: the first means the path is wrong or the document was never written, the second means the section moved or was renamed. When a heading was reworded rather than deleted, `edge-anchor-missing` names the anchor it most likely became.

Links to files Weft does not index — images, PDFs, anything outside `.md`, `.markdown`, `.yaml`, `.yml` — are not checked. They were never going to become nodes, so reporting them would bury the real breakage.

> **Using a renderer with templated link paths?** A link whose path contains an unresolved template variable records an edge to a document that will never exist, and `edge-target-missing` will report it. Until Weft can learn what the build resolved, set that rule to `warn` or `off` for such a project.

### Pending References

Writing a pointer to something you are about to create is normal practice, and a check that cannot express it fires on correct workflow and gets switched off. Mark such a link `pending` in a sidecar:

```yaml
# architecture.md.weft
links:
  - target: appendix.md#glossary
    type: see-also
    pending: true
```

A pending link reports under `edge-pending` at `info` instead of failing the build, so it stays visible and countable rather than silently excluded — a reference that has been pending a long time is itself worth noticing. Once the target exists, `edge-pending-resolved` tells you the marker can be removed, so the suppression does not outlive its reason.

Only sidecar links can declare this. An inline Markdown link has nowhere to put a marker, so an inline reference to something unwritten reports as `edge-target-missing` until inline links can carry attributes.

---

## Multiple Projects

A monorepo holding several products usually gives each product its own `docs/` tree. Set `projects` instead of `docsDir` to index them all into one graph:

```yaml
projects:
  - name: Alpha
    docsDir: products/alpha/docs
  - name: Beta
    docsDir: products/beta/docs
    slug: b
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Display name, shown as a group header in the left-hand nav |
| `docsDir` | yes | Directory to scan for this project's documents, relative to project root |
| `slug` | no | Id/URL namespace. Defaults to a kebab-cased `name` (`"Design System"` → `design-system`) |

### Node IDs

With `projects` set, node IDs are namespaced by slug — `products/alpha/docs/api.md` becomes `alpha/api.md`, and its URL is `/alpha/api`. Each project's `README.md` is addressed by the project path alone (`/alpha`). This keeps IDs unique when two products both have an `api.md`.

Configs using plain `docsDir` are unaffected: IDs stay relative to `docsDir` with no prefix.

### Cross-Project Edges

A relative Markdown link that leaves its own project and lands inside another one resolves to that project's node rather than being dropped:

```markdown
<!-- in products/alpha/docs/features.md -->
Alpha syncs through the [Beta API](../../beta/docs/api.yaml#listUsers).
```

Sidecar targets take a slug prefix to cross products, or stay bare to resolve within their own project:

```yaml
# products/alpha/docs/features.md.weft
links:
  - target: beta/api.yaml#/components/schemas/User   # another product
    type: implements

  - target: README.md                                # this product
    type: see-also
```

### docOrder

In multi-project mode, `docOrder` entries may be written either as a path relative to the project root or as a namespaced ID — both resolve to the same node:

```yaml
docOrder:
  - products/beta/docs/api.yaml
  - alpha/features.md
```

Ordering is global, so `docOrder` can interleave documents from different products.

---

## Per-Document Frontmatter

Markdown files can include YAML frontmatter to override metadata for that document:

```markdown
---
title: Architecture Overview
description: How the major components fit together.
theme: light
ogImage: assets/og-architecture.png
---

# Architecture Overview
...
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Overrides the document title (defaults to first `#` heading) |
| `description` | `string` | Used in `<meta name="description">` and `og:description` |
| `theme` | `"light" \| "dark"` | Force a specific theme for this document only |
| `ogImage` | `string` | Per-document `og:image`, overrides the global `ogImage` config |

---

## Sidecar Links (.weft files)

For edges that cannot be expressed as inline Markdown links — cross-format relationships, anchor-level connections to OpenAPI operations, or links with explicit type labels — create a sidecar file next to the source document.

A sidecar for `architecture.md` is named `architecture.md.weft`.

```yaml
# architecture.md.weft
links:
  - target: api.yaml#/paths/users/get
    type: implements
    label: User list endpoint

  - anchor: "#data-flow"
    target: design-decisions.md#caching-strategy
    type: specifies

  - target: research.md
    type: see-also
```

### Sidecar Fields

| Field | Required | Description |
|-------|----------|-------------|
| `target` | yes | Path to the target document, relative to `docsDir`. Append `#anchor` to target a specific anchor |
| `type` | no | Edge type. Defaults to `references` |
| `anchor` | no | Anchor within the *source* document where the edge originates (e.g. `#heading-slug`) |
| `label` | no | Human-readable label for the edge, shown in linked-items sidebar |
| `pending` | no | The target is known not to exist yet — see [Pending References](#pending-references) |

### Edge Types

Any string is valid as an edge type. Conventional types:

| Type | Meaning |
|------|---------|
| `implements` | This doc/anchor implements what the target specifies |
| `specifies` | This doc defines behavior implemented elsewhere |
| `references` | General reference (default) |
| `see-also` | Related reading, no formal dependency |
| `annotates` | This doc adds context to a specific part of the target |

---

## The Manifest

Running `weft index` (or `weft serve`) writes `docs/.weft/manifest.json`. This file is **auto-generated** — never hand-edit it. Add `.weft/` to `.gitignore` or commit it as a build artifact, depending on your workflow.

The manifest contains all discovered nodes (documents) and edges (typed relationships), and is what the UI reads at runtime.

### Multi-Project Output

With `projects` configured, indexing writes three kinds of artifact:

| Path | Contents |
|------|----------|
| `<project docsDir>/.weft/manifest.json` | One per project: that project's nodes, and the edges originating in it |
| `.weft/projects.json` | Index of every project manifest, plus the path of the merged manifest |
| `.weft/manifest.json` | The merged graph — every node and edge, with a `projects` array |

An edge belongs to the project of its source node, so a cross-project edge is stored with the product that declares it. Each project manifest can be published or versioned independently; consumers that want the whole graph in one request (such as `@weft/embed`) read the merged manifest instead.
