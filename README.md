# weft

A documentation graph browser that lives in the repository alongside the code. All project
artifacts — design docs, architecture diagrams, API specs, database schemas, wireframes,
slide decks, functional specs — are nodes in a navigable graph with typed, anchor-level
relationships between them. Any document can be the entry point. Navigation is a first-class
interaction, not an afterthought.

## Prerequisites

- Node.js >= 24
- [pnpm](https://pnpm.io/) 9+
- [just](https://github.com/casey/just) (task runner)

## Try It

Serve any GitHub repo's docs graph without cloning it or installing anything but Node 24+ and git:

```sh
npx @lepid-labs/weft serve --gh org/repo --open
```

Repos the target's config references are fetched too, so cross-repo links resolve. Private repos
use `GH_TOKEN`/`GITHUB_TOKEN` or `gh auth login`. To keep it around: `npm install -g @lepid-labs/weft`.

## Quickstart (from a checkout)

```sh
just install
just dev
```

`just dev` builds the core packages and starts `weft serve --dev` on the local docs graph, with the
UI served from source by Vite for hot reload. Without `--dev`, `weft serve` serves the UI's
adapter-node build (`pnpm --filter @lepid-labs/weft-ui build`), which is what a published package ships.

## Core Concepts

**Node:** Any document artifact — a Markdown file, an OpenAPI spec, a converted slide deck,
a wireframe, a diagram, a code file, an annotation set.

**Edge:** A typed, directional relationship between two nodes, optionally specifying an
anchor (section, slide, operation, element) on each end. Edge types include: *implements*,
*specifies*, *references*, *see-also*, *annotates*.

**Anchor:** An addressable location within a node — a heading in Markdown, a slide number
in a deck, an operation ID in an OpenAPI spec, a shape ID in a diagram, a line range in code.

**Graph manifest:** A derived index file (auto-generated, never hand-edited) that materializes
all nodes and edges discovered from the configured docs directory (default `docs/`) and from
the codebase (e.g. `@doc` references in code). Rebuilt on `weft serve`, `weft index`, and on
file watch.

## Documentation

### Using Weft

| Doc | Purpose |
|-----|---------|
| [docs/usage.md](docs/usage.md) | CLI commands, navigation, keyboard shortcuts |
| [docs/configuration.md](docs/configuration.md) | Config file options, frontmatter fields, sidecar `.weft` format |
| [docs/theming.md](docs/theming.md) | Themes, CSS custom properties, style overrides |

### Project Specification

| Doc | Purpose |
|-----|---------|
| [docs/PURPOSE.md](docs/PURPOSE.md) | Why Weft exists and what problem it solves |
| [docs/research.md](docs/research.md) | Problem, competitive landscape, conversion research |
| [docs/use-cases.md](docs/use-cases.md) | User scenarios |
| [docs/plan.md](docs/plan.md) | Phased delivery |
| [docs/implementation.md](docs/implementation.md) | Technical architecture and behavior |
| [docs/design-decisions.md](docs/design-decisions.md) | ADRs |
| [docs/features.md](docs/features.md) | Capability checklist (maps to use cases) |

**Paths:** User projects index their narrative under `docs/` by default (`docsDir` in
`weft.config.yaml`). A monorepo with several products sets `projects` instead, giving each product
its own docs root inside one graph — see
[Multiple Projects](docs/configuration.md#multiple-projects).

## License

MIT — see [LICENSE](LICENSE).
