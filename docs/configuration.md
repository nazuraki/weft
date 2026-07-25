# Configuration

## weft.config.ts

Place a `weft.config.ts` (or `.js` / `.mjs`) in your project root. Use `defineConfig` for TypeScript inference:

```ts
import { defineConfig } from "@weft/core";

export default defineConfig({
  docsDir: "docs",
  entryPoint: "docs/README.md",
  siteTitle: "My Project",
  siteUrl: "https://docs.example.com",
  defaultTheme: "dark",
  layout: "default",
  docOrder: ["README.md", "architecture.md", "api.yaml"],
  docOrderStrict: false,
  ignore: ["**/node_modules/**", "**/dist/**"],
});
```

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
| `docOrderStrict` | `boolean` | `false` | When `true`, only docs listed in `docOrder` appear in the LHN. Unlisted docs are hidden |
| `ignore` | `string[]` | `["**/node_modules/**", "**/dist/**"]` | Glob patterns to exclude from indexing |

---

## Multiple Projects

A monorepo holding several products usually gives each product its own `docs/` tree. Set `projects` instead of `docsDir` to index them all into one graph:

```ts
import { defineConfig } from "@weft/core";

export default defineConfig({
  projects: [
    { name: "Alpha", docsDir: "products/alpha/docs" },
    { name: "Beta", docsDir: "products/beta/docs", slug: "b" },
  ],
});
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

```ts
docOrder: ["products/beta/docs/api.yaml", "alpha/features.md"]
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
