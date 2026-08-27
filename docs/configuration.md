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
| `repos` | `Record<string, string>` | — | Local checkouts of other repos, keyed by `org/repo` — see [Multiple Repositories](#multiple-repositories) |
| `entryPoint` | `string` | `"docs/README.md"` | Default document opened when no path is specified |
| `siteTitle` | `string` | — | Site name used in `og:site_name` and page title (`Doc — Site`) |
| `siteUrl` | `string` | — | Canonical base URL (e.g. `https://docs.example.com`). Required for absolute `og:image` URLs |
| `ogImage` | `string` | — | Default `og:image`. Relative to project root or an absolute URL. Overridden per-document via frontmatter |
| `defaultTheme` | `"light" \| "dark"` | system preference | Theme applied on first visit before the user sets a preference |
| `layout` | `"default" \| "reader"` | `"default"` | `"reader"` hides the linked-items sidebar for a cleaner reading experience |
| `docOrder` | `string[]` | — | Explicit order for docs in the left-hand navigation. Filenames relative to `docsDir` |
| `docOrderStrict` | `boolean` | `false` | When `true`, only docs listed in `docOrder` appear in the LHN. Unlisted docs stay in the graph — see [Strict Ordering](#strict-ordering) |
| `ignore` | `string[]` | see [Build Output](#build-output) | Glob patterns to exclude from indexing |
| `contributions` | `string[]` | — | Contribution files written by an external build — see [External Tool Integration](#external-tool-integration) |
| `artifacts` | `string[]` | — | Generated outputs to register as nodes, as globs relative to each docs root — see [Generated Artifacts](#generated-artifacts) |
| `rules` | `Record<string, severity>` | — | Per-rule severity for the validation stage — see [Validation](#validation) |
| `includes` | `{ headingShift?, contributes? }` | see [Composed Documents](#composed-documents-include-edges) | Global defaults for include edges, overridable per edge |
| `extensions` | `Record<string, "markdown" \| "openapi">` | — | Extra file extensions to index — see [Extensions](#extensions) |

### Strict Ordering

`docOrderStrict` narrows the left-hand nav, not the graph. A document left out of `docOrder` is marked `hiddenFromNav` in the manifest and skipped by the tree, but it remains a full node: still indexed for search, still reachable by link or URL, and still a valid endpoint for edges pointing at it.

This matters because the two are not interchangeable. Removing those documents from the manifest would leave every edge touching one of them pointing at nothing, so a link from a listed document to an unlisted one would read as broken — including to the validation rules that check whether edges resolve.

---

## Extensions

Weft indexes `.md`, `.markdown`, `.yaml` and `.yml` by default. `extensions` maps additional file extensions to one of Weft's two doc types, so a project can index more without changing what ships by default:

```yaml
extensions:
  .qmd: markdown
```

A `.qmd` file is now scanned, parsed and linked exactly like a `.md` file — same anchor extraction, same frontmatter handling.

`getDocType` has always known how to parse `.json` as OpenAPI; it simply isn't scanned for by default (see [below](#rules) for why). A project keeping a JSON OpenAPI spec in its docs opts in the same way:

```yaml
extensions:
  .json: openapi
```

Additive only: `extensions` can add a new extension, or opt in one `EXTENSION_MAP` already knows how to parse (like `.json` above), but it cannot remap an extension Weft already indexes by default. `extensions: { .yaml: markdown }` would silently change how every existing `.yaml` in the project parses — its anchors, and every link that resolves against them — so it is rejected at load time, naming the extension and its built-in mapping.

---

## External Tool Integration

Weft indexes source. Most documentation projects put a renderer or build tool between source and what readers receive, and that build knows things source cannot express: what a templated link resolved to, what it generated and from what.

Rather than an adapter per tool, Weft reads one **contribution file** that any build can write — the same shape as a linter emitting SARIF or a compiler emitting source maps. Point at it with globs relative to the project root:

```yaml
contributions:
  - build/weft-contribution.json
```

JSON or YAML, both accepted.

```json
{
  "version": 1,
  "tool": "my-renderer 1.4.0",
  "nodes": [
    { "id": "generated/summary.md", "type": "markdown", "title": "Generated Summary" }
  ],
  "edges": [
    { "from": { "node": "generated/summary.md" }, "to": { "node": "index.md" }, "type": "derives-from" }
  ],
  "metadata": {
    "handbook.md": { "title": "Handbook v2.41" }
  }
}
```

| Key | Purpose |
|-----|---------|
| `version` | Contribution schema version. Currently `1` |
| `tool` | Optional. Named in any message about this file, so a bad contribution is traceable |
| `nodes` | Documents the build knows about that indexing source cannot discover |
| `edges` | Relationships the build knows about. Any edge `type` is valid; `derives-from` is the convention for generated output |
| `metadata` | Field patches for documents Weft already indexed, keyed by node id |

### Pipeline Order

The order is part of the contract, not an implementation detail:

1. **Weft indexes source.** Indexing rendered output instead would lose sidecars and source structure.
2. **Contributions apply**, in the order their files sort by path — so a merge is reproducible regardless of how the filesystem enumerates a glob. A later contribution overrides an earlier one.
3. **Ordering and nav filtering apply last**, to the combined set, so a contributed document sorts and honours `docOrder` exactly like an indexed one.

### What a Patch May Set

`metadata` may set `title`, `description`, `theme`, `ogImage`, `hiddenFromNav`, `contentHash` and `lineCount`.

It may **not** set `id`, `type`, `anchors` or `project`. The first three are facts about the file Weft read and the last is graph topology; a build contributes what Weft cannot see, and overriding extraction output is not that. Attempting it fails with the offending field named.

Two situations are reported rather than fatal, since neither makes the graph unusable:

- a patch for a node id that does not exist is ignored with a warning
- a contributed node whose id Weft **already indexed** is merged over, with a warning — usually the signature of build output landing inside `docsDir`

### Build Output

If a renderer emits into `docsDir`, Weft indexes every generated file as a node alongside the source it came from, and every document appears twice.

`_site/`, `_book/`, `.quarto/`, `dist/` and `node_modules/` are excluded by default. Deliberately **not** excluded: `site/`, `public/`, `build/` and `out/` — all commonly hold sources, and hiding real documents by default is worse than indexing output. If your build writes to one of those inside `docsDir`, add it to `ignore` yourself.

### Links to a Published Form

Authors link to what a reader will actually open, so a documentation set that publishes is full of links naming the rendered copy rather than the source:

```markdown
See [the guide](guide.html) for setup.
```

Nodes are the source documents, so `guide.html` is not one and that reference would be stored as an edge to nothing. Instead, when a link target is not a node and exactly one source document shares its path stem, the edge resolves to that source — `guide.html` becomes an edge to `guide.md`, anchor intact. The manifest records the original path in `resolvedFrom`, and the linked-items sidebar shows it on hover, so the inference is visible rather than silent.

The rule is deliberately narrow:

- only `.html`, `.htm` and `.pdf` targets are treated as a published form. Sharing a stem with a document does not make `arch.png` a reference to `arch.md`
- the target must not already be a node
- exactly one source may share the stem. If both `guide.md` and `guide.yaml` exist, the link is left alone rather than guessed at

A published-form link with no matching source stays unresolved, and is reported by [`edge-target-missing`](#rules) only if its extension is one Weft indexes — otherwise it shows in the sidebar as **not found**.

### Templated Links

A link whose path still contains a placeholder — `{{version}}/api.md`, `${lang}/guide.md`, `{% raw %}`, `<%= path %>` — has not been resolved yet; the renderer decides what it points at. Weft records no edge for these rather than inventing one to the literal text, which would make [`edge-target-missing`](#rules) report correct source as broken.

Template syntax in the *anchor* is ignored, since it does not change which document is targeted.

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
| `assert-version-mismatch` | `error` | A link asserts a version its target no longer declares |
| `assert-line-count-mismatch` | `warn` | A link asserts a line count its target no longer has |
| `assert-modified-mismatch` | `warn` | A link asserts a date its target no longer matches |
| `assert-unverifiable` | `warn` | A link asserts something that cannot be checked against its target |
| `artifact-stale` | `error` | A generated output no longer reflects the source it was built from |
| `artifact-source-unrecorded` | `info` | A `derives-from` edge records no source hash, so staleness cannot be checked |
| `node-duplicate` | `info` | Several documents hold identical content at different paths |
| `node-diverged` | `warn` | Documents that once held identical content no longer match |
| `include-cycle` | `error` | Documents include each other in a cycle, so no composed form of them exists |
| `validator-error` | `error` | A rule threw while running |

A missing document and a missing anchor are separate rules because they usually have different causes and different fixes: the first means the path is wrong or the document was never written, the second means the section moved or was renamed. When a heading was reworded rather than deleted, `edge-anchor-missing` names the anchor it most likely became.

**Moved documents are named, not merely reported broken.** Renaming a document breaks every link to it, and a pile of dangling references gives no clue what happened. Weft consults git's rename detection, so a link to a document that moved reports what it became:

```
  error  edge-target-missing  README.md -> setup.md
          setup.md moved to guides/setup.md
          hint: Point the link at guides/setup.md.
```

It stays `edge-target-missing` at the same severity — the link does need fixing either way — and the new id is also in `data.renamedTo` for `--json` consumers. A destination that has since been deleted is not suggested, since pointing the link at it would only break it differently.

Links to files Weft does not index — images, PDFs, anything outside `.md`, `.markdown`, `.yaml`, `.yml`, and whatever [`extensions`](#extensions) added — are not checked. They were never going to become nodes, so reporting them would bury the real breakage.

> **Using a renderer?** Links whose paths still hold template syntax produce no edges at all, so they cannot be reported as broken — see [Templated Links](#templated-links). If your build resolves paths in a form Weft cannot recognise as a placeholder, a [contribution file](#external-tool-integration) can declare the resolved edges instead.

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

### Assertions

Documents constantly assert things about each other. Which version it is. How long it is. When it last changed. Every such claim is true when written and rots silently afterwards, and the cost is usually paid by a reader — often an external one — acting on something that stopped being true months earlier.

A sidecar link can state the claim where it can be checked:

```yaml
# integration-guide.md.weft
links:
  - target: spec.md
    type: references
    asserts:
      version: "2.41"
      lineCount: ~3500
      modified: 2026-07
```

| Property | Compared against | Matching |
|----------|------------------|----------|
| `version` | The target's frontmatter `version` | Exact, as written |
| `lineCount` | Lines of text in the target | Exact for a number; `~3500` allows ten percent either way |
| `modified` | The target's last commit date | Prefix, so `2026-07` asserts the month and a full timestamp asserts the instant |

A claim that no longer holds reports under its own rule, so a project can decide how much each one matters. A stale version is an `error` by default, because a version pointer is the most expensive thing in a documentation set to maintain by hand and nothing else signals when one goes stale. Length and date drift with ordinary editing, so those warn.

`~` exists because prose makes approximate claims. "Roughly 3,500 lines" is what a document actually says, and an exact assertion would either be wrong immediately or have to be rewritten on every edit.

A claim nothing can check — a `version` asserted against a document that declares none, a count that is not a number, a property no node has — reports as `assert-unverifiable`. Nothing is known to be wrong, but an assertion nobody can check is a check the author believes they have and does not.

Assertions are skipped on a link marked `pending`, and on one whose target is not in the graph: that is `edge-target-missing`'s finding, and reporting it twice says nothing new.

> **Where dates come from.** `modified` is the date of the last commit touching the file, never the filesystem's mtime. Git does not preserve modification times, so a fresh clone or a CI checkout makes every file look simultaneously modified — meaningless in exactly the environment these checks run in. A document that is untracked or uncommitted, or a project that is not a git repository, simply has no date, and asserting one reports as `assert-unverifiable`.

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
| `docsDir` | yes | Directory to scan for this project's documents, relative to project root — or to the mapped checkout when `repo` is set |
| `slug` | no | Id/URL namespace. Defaults to a kebab-cased `name` (`"Design System"` → `design-system`) |
| `repo` | no | Repo identity (`org/repo`) whose checkout holds this project's docs — see [Multiple Repositories](#multiple-repositories) |
| `manifestInRepo` | no | Write this project's manifest into its own checkout even when it lives outside the project root. Default `false` |

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

Ordering is global, so `docOrder` can interleave documents from different products. A repo-backed project's documents are ordered by namespaced ID only — its `docsDir` is relative to another checkout, so a project-root-relative path cannot name them.

---

## Multiple Repositories

A docs root does not have to live in the repo weft runs from. A `projects` entry may name a `repo` — an `org/repo` identity — and the `repos` map says where that repo is checked out on this machine:

```yaml
# weft.config.yaml (committed)
repos:
  acme/alpha: ../alpha

projects:
  - name: Meta
    docsDir: docs
  - name: Alpha
    repo: acme/alpha
    docsDir: docs        # relative to the mapped checkout
```

Everything then works as in any multi-project setup: nodes from every repo land in one namespaced graph, links crossing repos resolve to edges, and each root's git history comes from its own repository, so every node carries its own repo's dates.

`repos` values are paths — relative to the project root, absolute, or `~`-prefixed.

### Local Overrides

Where a checkout lives is one machine's business, so the mapping belongs in `weft.config.local.yaml`, which should be gitignored:

```yaml
# weft.config.local.yaml (gitignored)
repos:
  acme/alpha: ~/src/alpha
```

Local entries override committed ones per identity. The local file may set **only** `repos` — any other option there is an error, so committed and local config cannot quietly diverge. A project naming a `repo` that no map supplies fails at load with an error pointing at the local file.

### GitHub Blob URLs

A link to `https://github.com/acme/alpha/blob/main/docs/api.md` in any indexed document normally stays an external link. With `acme/alpha` mapped, the URL resolves against the checkout, and when the file falls inside a configured docs root it becomes a normal graph edge — same node, same validation, same sidebar presence as a relative link. The same Markdown is fully functional on GitHub *and* in weft.

```markdown
See the [Alpha API](https://github.com/acme/alpha/blob/main/docs/api.md#endpoints).
```

The edge records the URL as written in `resolvedFrom`. Any `blob/<ref>/` segment is accepted — weft serves the working tree, so which ref the URL claims does not affect resolution. A URL into an unmapped repo, a non-`blob` URL (`tree/`, issues, other hosts), or a path landing outside every docs root stays an ordinary external link. Nothing is ever fetched over the network — unless you opt in with `weft serve --repo`, below.

### Serving Without a Checkout

Reading a cross-repo graph should not cost what authoring one does. `weft serve --repo` fetches instead of requiring checkouts:

```sh
weft serve --repo acme/design-review          # remote HEAD
weft serve --repo acme/design-review --ref v2 # branch, tag, or commit sha
```

Weft fetches that repo, reads its `weft.config.yaml`, fetches the repos it references, and serves the merged graph. A repo in the `repos` map that resolves to a real local path keeps winning — fetching only fills the gaps, so someone with three of five repos checked out reads their local working trees for those three and fetched copies of the rest.

Fetches are blobless partial clones (`--filter=blob:none`), so each fetched root keeps its full git history — `modified` dates and the history-reading checks work exactly as over a local checkout. Clones land in a cache (`$WEFT_CACHE_DIR`, `$XDG_CACHE_HOME/weft`, or `~/.cache/weft`) keyed by resolved commit sha, so a moved branch invalidates cleanly; a branch's ref resolution is re-checked after 15 minutes, or immediately with `--refresh`. Fetched checkouts are read-only: nothing is written into them, and they are not watched for changes.

Private repos authenticate with `GH_TOKEN` or `GITHUB_TOKEN`, falling back to `gh auth token` when the GitHub CLI is installed. GitHub reports a private repo it will not serve exactly like a repo that does not exist, so a not-found error always means one of the two. GitHub only; other hosts are out of scope.

### Manifest Placement

`weft index` never writes into a checkout it does not own. A root living outside the project root gets its per-project manifest under the meta repo instead — `.weft/projects/<slug>/manifest.json` — and `.weft/projects.json` records where each manifest actually is. When the single implicit `docsDir` points outside the project root, the merged manifest likewise lands under the project root's `.weft/` rather than in the external tree.

Set `manifestInRepo: true` on a project to opt a co-owned checkout back into `<docsDir>/.weft/manifest.json` alongside its docs.

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
| `version` | `string` | The document's own version, so other documents can [assert](#assertions) it |

`version` is read exactly as written, so quoting is optional but harmless — `2.10` stays `2.10` rather than becoming the number 2.1. A document with no version is entirely normal, and nothing treats its absence as a problem.

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
| `asserts` | no | Claims this link makes about its target — see [Assertions](#assertions) |
| `headingShift` | no | On an `includes` edge: `auto` (default) or `none` — see [Composed Documents](#composed-documents-include-edges) |
| `contributes` | no | On an `includes` edge: `source` (default) or `inline` — see [Composed Documents](#composed-documents-include-edges) |

### Edge Types

Any string is valid as an edge type. Conventional types:

| Type | Meaning |
|------|---------|
| `implements` | This doc/anchor implements what the target specifies |
| `specifies` | This doc defines behavior implemented elsewhere |
| `references` | General reference (default) |
| `see-also` | Related reading, no formal dependency |
| `annotates` | This doc adds context to a specific part of the target |
| `derives-from` | This was generated from the target — see [Generated Artifacts](#generated-artifacts) |
| `includes` | This doc renders the target (or one section of it) inline — see [Composed Documents](#composed-documents-include-edges) |

---

## Composed Documents (include edges)

A document can be composed from sections of others: an FAQ whose every answer lives in the document that owns it, or an org-level overview assembled from the architecture summaries of several repositories. Instead of copying content in — and watching the copies drift — the composing document links to its sources as usual, and a sidecar marks which of those links are includes:

```yaml
# faq.md.weft
links:
  - target: runbook.md#deploys
    type: includes
  - target: pricing.md#how-billing-works
    type: includes
```

The document stays a plain link list on GitHub, where it renders as exactly that. In Weft's UI each include link that stands alone as a block — the sole content of a paragraph or list item — expands inline at render time: the target's anchor range renders in place, inside a visibly attributed frame linking back to the source. A link woven into a sentence never expands.

**Anchor ranges.** `target: doc.md#some-heading` includes from that heading to the next heading of the same or shallower level. A target with no anchor includes the whole document.

**Heading levels and search attribution** have global defaults with a per-edge override:

```yaml
# weft.config.yaml
includes:
  headingShift: auto    # auto | none
  contributes: source   # source | inline
```

| Option | Values | Meaning |
|--------|--------|---------|
| `headingShift` | `auto` (default) | Included headings demote beneath the heading level at the point of inclusion, so the composed page reads as one outline |
| | `none` | Source levels are preserved — for sources already authored at the right depth |
| `contributes` | `source` (default) | Included content is searchable only under its source node, so search never returns duplicate hits |
| | `inline` | Also attributed to the including document. Declared and recorded on the edge; search does not honour it yet |

Resolved values are stamped onto each `includes` edge at build time, so a manifest consumer never needs the config.

**Cycles.** The [`include-cycle`](#rules) rule (`error`) reports documents that include each other, at document granularity, once per cycle. The renderer keeps its own independent visited set and depth cap, so a manifest that predates the rule cannot hang the page — the cycle point renders as an ordinary link with a notice.

**Drift detection for free.** An include edge is a sidecar link, so it can carry [`asserts`](#assertions): assert `lineCount` or `modified` on the included section's document and `weft check` reports when a source changed after the composition was last reviewed.

---

## Duplicate and Diverged Copies

The same document kept in two places drifts, and the graph sees two unrelated nodes. The expensive version of this is a copy in an outbound directory and a copy in an internal one, byte-identical for months, until an edit pass scoped to one location quietly makes the copy that reaches external readers the wrong one.

Weft reports it in two stages, because a copy is a different problem before and after it drifts.

`node-duplicate` compares content hashes and reports documents that currently agree, at `info`. Nothing is wrong yet — but this is the cheapest moment the problem will ever be visible, and the window closes on the first edit to either copy.

`node-diverged` reports documents that **once** held identical content and no longer do, at `warn`. This is the half that matters, and it cannot be done by comparing hashes: two copies stop sharing a hash at exactly the moment they start being a problem, so a check built only on hashes goes quiet precisely when it should speak. Weft asks git instead — these paths held the same blob at some point in history — and rename detection means a copy that has since been moved is still recognised.

```
  info   node-duplicate  (graph)
          Identical content at 2 paths: outbound-setup.md, setup.md

  warn   node-diverged   (graph)
          Once identical, now different: guides/setup.md, outbound-setup.md
```

Both read only what reached the manifest, so [`ignore`](#build-output) already applies. Both name the graph rather than one of the copies: nothing here knows which came first, and naming one would imply it is the original. If one copy really is generated from the other, say so with a [`derives-from`](#generated-artifacts) edge.

> **These need git.** Divergence is history, and without a repository there is none — the check simply has nothing to say. That is not the same as reporting the copies are fine, so a project that relies on it should make sure CI checks out enough history for `git log` to see the past (a shallow clone sees only what it fetched).

---

## Generated Artifacts

A documentation set that publishes ships outputs built from its sources, usually PDFs, and those are the copies that reach external readers. They are also the copies nobody looks at again after building them, so an output that has fallen behind its source goes unnoticed by everyone except the audience.

Weft indexes `.md`, `.markdown`, `.yaml` and `.yml` (plus whatever [`extensions`](#extensions) added). A PDF is none of those, so it is not a node and an edge has nothing to point at. Register outputs explicitly:

```yaml
artifacts:
  - "**/*.pdf"
```

Globs are relative to each docs root, the same as document indexing, and `ignore` applies to them too. An artifact node carries an id, a content hash and nothing else it does not need: no anchors, no line count, and it never appears in navigation. An output that lives outside every docs root is declared by a [contribution](#external-tool-integration) instead, with `type: artifact`.

> **Artifacts hash their bytes, documents hash their normalized text.** Both fill `contentHash` with the same SHA-256 and truncation, but a document's hash strips a BOM and converts CRLF to LF first. That is a text operation, and a binary holds byte sequences that merely look like line endings. The two are never compared against each other.

### Staleness

Declare what an output was built from, and from which version of it, with a `derives-from` edge carrying `sourceHash` — the source's `contentHash` at the moment of generation:

```yaml
# handbook.pdf.weft — the sidecar belongs to the artifact, so edges run output -> source
links:
  - target: handbook.md
    type: derives-from
    sourceHash: 8739a4a018eb3517

  # A template change invalidates the output too.
  - target: theme.md
    type: derives-from
    sourceHash: 41c0f2a9de7b0c85
```

When the source's current hash no longer matches, `artifact-stale` reports it — an error by default, because the stale copy is the one the audience sees. Each source is checked on its own, so several `derives-from` edges cover an output whose inputs are more than one document.

An edge with no `sourceHash` reports as `artifact-source-unrecorded` at `info`. Nothing is known to be wrong: `derives-from` is also a fair way to express that two things are related without asking for the relationship to be checked. It stays visible and countable rather than silent.

**The hash has to be recorded by whatever does the generating**, since that is the only party that knows which version it read. `hashContent`'s recipe is documented for exactly this — strip a leading BOM, convert CRLF to LF, SHA-256, keep the first 16 hex characters — so a build can compute it without running Weft. A build that already knows what it produced is usually better off declaring the whole thing through a [contribution](#external-tool-integration).

> **Why not modification times?** Git does not preserve them. A fresh clone or a CI checkout gives every file the same timestamp, so a check built on mtime would be meaningless in exactly the environment it should run in.

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
