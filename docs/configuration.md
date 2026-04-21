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
| `docsDir` | `string` | `"docs"` | Directory to scan for documents, relative to project root |
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

Running `weft index` (or `weft serve`) writes `docs/.weft/manifest.json`. This file is **auto-generated** — never hand-edit it. Add `docs/.weft/manifest.json` to `.gitignore` or commit it as a build artifact, depending on your workflow.

The manifest contains all discovered nodes (documents) and edges (typed relationships), and is what the UI reads at runtime.
