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

Both commands currently run the edge-resolution checks: every link must point at a document in the graph, and every anchor must exist on the document it targets. See [Rules](configuration.md#rules) for the full list and [Pending References](configuration.md#pending-references) for marking a link at something you have not written yet.

## Navigation

- **Document tree** — left-hand sidebar lists all indexed docs; click any node to navigate.
- **Linked items** — right-hand sidebar shows edges to/from the current document (hidden in `reader` layout).
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
