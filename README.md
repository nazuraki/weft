# weft

A documentation graph browser that lives in the repository alongside the code. All project
artifacts — design docs, architecture diagrams, API specs, database schemas, wireframes,
slide decks, functional specs — are nodes in a navigable graph with typed, anchor-level
relationships between them. Any document can be the entry point. Navigation is a first-class
interaction, not an afterthought.

**Status:** This repository currently holds the **product specification** (architecture,
features, use cases, design decisions). Application code will live here as implementation
progresses.

**License:** MIT (see [LICENSE](LICENSE)).

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

| Doc | Purpose |
|-----|---------|
| [docs/research.md](docs/research.md) | Problem, competitive landscape, conversion research |
| [docs/use-cases.md](docs/use-cases.md) | User scenarios |
| [docs/plan.md](docs/plan.md) | Phased delivery |
| [docs/implementation.md](docs/implementation.md) | Technical architecture and behavior |
| [docs/design-decisions.md](docs/design-decisions.md) | ADRs |
| [docs/features.md](docs/features.md) | Capability checklist (maps to use cases) |

Start with [doc/README.md](doc/README.md) for a suggested reading order.

**Paths:** User projects index their narrative under `docs/` by default (`docsDir` in
`weft.config.ts`).
