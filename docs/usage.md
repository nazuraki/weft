# Usage

## Quick Start

```sh
# Install globally
npm install -g @weft/cli

# From your project root (where weft.config.yaml lives)
weft serve
```

Opens the graph browser at `http://localhost:7777`. Weft watches your docs directory and rebuilds the manifest on every file change.

## CLI Commands

### `weft serve [root-dir]`

Starts the Weft UI server and watches for changes.

```sh
weft serve               # uses current directory
weft serve /path/to/repo # explicit root
weft serve --port 8080   # custom port
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `7777` | Port to listen on |
| `--open` | `true` | Open browser on start |

The server rebuilds and hot-reloads the manifest whenever docs change. Shut down with `Ctrl-C`.

### `weft index [root-dir]`

Rebuilds the manifest without starting the UI. Writes `docs/.weft/manifest.json`.

```sh
weft index               # current directory
weft index --quiet       # suppress output
weft index /path/to/repo
```

Useful in CI to pre-build the manifest, or to verify graph state without launching a browser.

| Flag | Default | Description |
|------|---------|-------------|
| `--quiet` | `false` | Suppress output |

### `weft analyze [root-dir]`

Builds the graph, runs every validation rule over it, and reports what they found. Always exits 0 — it reports, it does not gate.

```sh
weft analyze                 # current directory
weft analyze --json          # machine-readable result
weft analyze --list-rules    # rule ids and their default severities
```

| Flag | Default | Description |
|------|---------|-------------|
| `--json` | `false` | Emit the full result as JSON, including counts and which rules ran |
| `--list-rules` | `false` | List the registered rules and exit without validating |

`--list-rules` is how you find the ids to put in the [`rules`](configuration.md#validation) config block.

### `weft check [root-dir]`

The same validation, for CI. Exits `1` if any rule reports an **error**; warnings and notes report but pass, so a rule can be adopted at `warn` before being promoted.

```sh
weft check               # current directory
weft check --json        # machine-readable result
```

| Flag | Default | Description |
|------|---------|-------------|
| `--json` | `false` | Emit the full result as JSON |

Turn a noisy rule down or off per project with the [`rules`](configuration.md#validation) config block rather than dropping the command from CI.

Both commands currently run four families of check. The **edge-resolution** rules require every link to point at a document in the graph, and every anchor to exist on the document it targets — naming what a moved target became, rather than reporting an unexplained break. The **assertion** rules check the claims links make about their targets: a cited version, length, or date that no longer holds. The **artifact** rules report a generated output that has fallen behind the source it was built from. The **copy** rules report the same document kept in two places, both while the copies still agree and once they have drifted apart.

See [Rules](configuration.md#rules) for the full list, [Assertions](configuration.md#assertions) for how a link states a claim, [Generated Artifacts](configuration.md#generated-artifacts) for registering outputs, [Duplicate and Diverged Copies](configuration.md#duplicate-and-diverged-copies) for the copy checks, and [Pending References](configuration.md#pending-references) for marking a link at something you have not written yet.

Two of these read git history. Indexing already walks `git log` once per docs root for commit dates, and when the history-reading rules are enabled `weft check` deepens that same walk (adding rename detection) rather than running a second one — one `git log` per root either way. Outside a repository the walk finds nothing, the history rules have nothing to say, and the rest of the checks are unaffected.

## Embedding

`@weft/embed` offers two mounts, and which one you want depends on how much of the page is yours.

`mountWeft` gives you the whole product — header, document tree, search, theme handling — and fetches documents from a GitHub repo or a base URL:

```js
const unmount = Weft.mountWeft('#root', { repo: 'acme/docs', branch: 'main' });
```

`mountDoc` gives you the reader and the graph around it, and nothing else. No header, no tree, no search palette, no window-level key handler — for a host that already has all of those and wants the part it does not:

```js
const doc = Weft.mountDoc('#host', {
  client,                  // your own fetchDoc + search
  manifest,                // you load it; Weft does not decide where it lives
  nodeId: 'guide.md',
  linkedItems: true,       // opt into the sidebar without the rest
  onNavigate: (id, anchor) => router.go(id, anchor),
});

doc.update({ nodeId: 'api.md' });                    // re-point it, no anchor
doc.update({ nodeId: 'api.md', anchor: '#errors' }); // …or to a section
doc.destroy();                                       // remove it
```

Three things about this mount are deliberate:

**The client is yours.** `WeftClient` is two methods — `fetchDoc(id)` and `search(query)`. A host with its own document endpoints and its own search backend should not have to re-serve files at a URL shape Weft picked, nor ship a second search index to duplicate one it already has.

**Navigation is an output, not an action.** Following a link inside a document calls `onNavigate` and changes nothing. The host owns its URL and its history, and calls `update` if it decides to show the new document.

`update` takes the whole state rather than a patch. That is deliberate: with a patch, an omitted anchor needs a rule, and both answers are wrong somewhere — keep it and re-pointing carries the old anchor into the new document, which scrolls to the wrong place whenever the two share a slug; clear it and a same-document refresh loses the reader's position. Passing both fields every time removes the question.

**Weft stays inside its own container.** Everything it renders sits within `.weft-scope`, so its box model, fonts and colours reach only its own subtree — your reset and your typography are untouched outside it. It never writes `data-theme` on `documentElement`: set it on the container to pick a scheme, or leave it and Weft inherits what you already decided. Anchor scrolling is scoped to the mount too, so a link to `#overview` inside a document will not scroll an `#overview` of yours elsewhere on the page.

### Theming contract

These `--weft-*` custom properties are the integration surface. Set any of them on the mount container, or any ancestor of it, to make Weft look like the rest of your page:

| Group | Properties |
|-------|------------|
| Surfaces | `--weft-color-bg`, `--weft-color-bg-secondary`, `--weft-color-bg-elevated` |
| Lines | `--weft-color-border`, `--weft-color-border-subtle` |
| Text | `--weft-color-text`, `--weft-color-text-secondary` |
| Emphasis | `--weft-color-link`, `--weft-color-link-hover`, `--weft-color-accent`, `--weft-color-accent-subtle` |
| Type | `--weft-font-sans`, `--weft-font-heading`, `--weft-font-mono` |
| Code | `--weft-code-keyword`, `--weft-code-string`, `--weft-code-number`, `--weft-code-comment`, `--weft-code-function`, `--weft-code-variable`, `--weft-code-type`, `--weft-code-meta` |
| Layout | `--weft-lhn-width`, `--weft-rhs-width`, `--weft-header-height` |

**Weft never declares these — it only reads them.** That's what makes the contract hold from an ancestor: a value declared on an element beats an inherited one at any specificity, so a token Weft set on its own root could not be overridden from the container this section tells you to use. Anything you leave unset falls back to Weft's own default.

Weft renders light unless something asks for dark. Set `data-theme="dark"` on the container, or anywhere above it, to select the dark defaults for whichever properties you did not set yourself. A mount's own `data-theme` always wins over a host's, so an embed can be dark inside a light page.

> The `--w-*` properties you'll see in the stylesheet are internal — the resolved values, not the inputs. Setting one does nothing useful; set the `--weft-*` name instead.

> **Not published yet.** Neither `@weft/cli` nor `@weft/embed` is on npm, so embedding today means building from a checkout and vendoring `weft.iife.js` and `weft.css` by hand — with no version to pin and no signal when they change.

## Navigation

- **Document tree** — left-hand sidebar lists all indexed docs; click any node to navigate.
- **Linked items** — right-hand sidebar shows edges to/from the current document (hidden in `reader` layout). A reference whose target is not in the graph is listed struck through and marked *not found* rather than as a working link — a broken reference is worth seeing, but it is not somewhere you can navigate.
- **Search** — `Cmd+K` opens the search palette; full-text search across all doc content and anchors.
- **Back / forward** — browser history is maintained; back/forward work as expected within the app.
- **In-document links** — standard Markdown links between docs are intercepted and navigate within the app.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open search palette |
| `Esc` | Close search palette |

## Supported Document Types

| Type | Extension | Notes |
|------|-----------|-------|
| Markdown | `.md` | Headings become anchors, slugged exactly as GitHub does. Headings inside fenced code blocks are ignored |
| OpenAPI | `.yaml`, `.yml` | Operation IDs and schema names become anchors |
| Artifact | any | Only when listed in [`artifacts`](configuration.md#generated-artifacts). Tracked and checked, never rendered — there is nothing in a PDF for Weft to show |

## Rendering

Markdown is rendered with GitHub-flavoured Markdown plus:

- **Syntax highlighting** on fenced blocks that declare a language, with the language shown as a chip on the block. Highlighting is class-based and themed with Weft's own custom properties, so it follows light and dark without a second stylesheet.
- **Scrollable tables** — every table is wrapped so a wide one scrolls itself instead of moving the page sideways, with zebra striping and a row hover.
- **Heading permalinks** — every heading gets an id (the same slug the graph indexes) and a `#` control to copy a link to it.

### Raw HTML is sanitized

Documents may contain raw HTML, and it is filtered through an allowlist before it reaches the page. Inline event handlers, `<iframe>`, and `javascript:` links do not survive; ordinary formatting and a plain inline `<svg>` figure do.

This matters most for `@weft/embed`, where a host page renders Markdown it may not control — the person carrying the risk is not always the person who can merge to the docs repo.

### Contributing render passes

A corpus with conventions of its own — severity markers, status chips, a house callout style — can supply its own render passes rather than forking the renderer:

```js
mountWeft('#root', {
  repo: 'acme/docs',
  rehypePlugins: [myCallouts],
  extendSchema: (schema) => ({
    ...schema,                          // extend it — do not replace it
    attributes: {
      ...schema.attributes,
      span: [...(schema.attributes?.span ?? []), ['className', 'callout']],
    },
  }),
});
```

**Spread the schema you were given.** Returning a fresh object drops `tagNames`, and a missing `tagNames` disables the allowlist rather than emptying it — every tag would be permitted, `<script>` included. Weft rejects a schema without `tagNames` or `attributes` rather than rendering with it, so the mistake fails loudly instead of silently.

Contributed plugins run after raw HTML is parsed, so they can see all of it, and **before** sanitizing, so what they emit is checked like everything else. That ordering is deliberate in both directions: a plugin cannot smuggle markup past the allowlist, and a stock allowlist would otherwise strip exactly the classes the plugin just added — which is what `extendSchema` is for.
