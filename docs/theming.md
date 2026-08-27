# Theming

Weft's look comes from the [ui-std-lib](https://github.com/nazuraki/ui-std-lib)
design system (`@nazuraki/styles`). A **style** is one of its themes; Weft
bundles every theme the installed package ships and the manifest that
describes them, so styles are picked by name.

## Picking a style

```yaml
# weft.config.yaml
style: luminous-precision        # one theme — scheme fixed, toggle hidden
# or a pair the light/dark toggle switches between:
style:
  dark: luminous-precision
  light: summer-cloud
```

The default is the pair above. `weft.config.local.yaml` may also set `style`
(and `styleUrl`) — one developer previewing the corpus in a different theme
without touching the committed config; the local value wins.

## Scheme resolution

With a pair configured, which half renders is the *scheme* choice:

1. User's saved preference (persisted in `localStorage` as `light`/`dark`)
2. `defaultTheme` from `weft.config.yaml`
3. OS/browser system preference

The header toggle switches schemes and persists the choice. With a single
style there is no second scheme, so the toggle hides and `defaultTheme` is
ignored.

To force a scheme on one document regardless of preference, use frontmatter:

```markdown
---
theme: light
---
```

The override element re-declares the theme's tokens locally, so prose and
code colors flip per document. (Structural component rules from two themes
resolve by stylesheet order rather than nesting depth — an upstream CSS
limitation — so the override is token-dominant.)

## Token resolution

Every visual property resolves through three layers, first match wins:

1. **`--weft-*`** — the host's input (see the theming contract in
   [usage.md](usage.md)). Weft only ever reads these.
2. **`--nb-*`** — the active style's design tokens, declared by
   `@nazuraki/styles` under `[data-nb-style="<theme>"]` guards. Weft sets that
   attribute on its scope root (and per-doc override elements) and never
   declares an `--nb-*` value itself.
3. A built-in literal, so a mount with no style attribute and no host input
   still renders.

The `--w-*` names in the stylesheet are the resolved internals — set the
`--weft-*` name instead.

## Styles newer than the bundled set

`styleUrl` names a base URL serving the ui-std-lib styles layout
(`<base>/manifest.json`, `<base>/<name>/index.css`) — for example a pinned
jsDelivr path:

```yaml
style: some-future-theme
styleUrl: https://cdn.jsdelivr.net/gh/nazuraki/ui-std-lib@v0.4.0/styles
```

Names the bundled manifest knows come from the bundle regardless; only
unknown names load remotely (stylesheet and webfonts both, from the remote
manifest). If the fetch fails, Weft warns and renders the literal fallback
palette rather than refusing to start.

## Webfonts

Themes do not bundle fonts. The standalone app emits the Google Fonts links
for the configured pair straight from the styles manifest. Embed hosts add
the links themselves (URLs in `@nazuraki/styles/manifest`) — except
`styleUrl` themes, whose fonts are injected from the remote manifest.
