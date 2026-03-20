# weft

A documentation graph browser that lives in the repository alongside the code. All project
artifacts — design docs, architecture diagrams, API specs, database schemas, wireframes,
slide decks, functional specs — are nodes in a navigable graph with typed, anchor-level
relationships between them. Any document can be the entry point. Navigation is a first-class
interaction, not an afterthought.

## Core Concepts

**Node:** Any document artifact — a Markdown file, an OpenAPI spec, a converted slide deck,
a wireframe, a diagram, a code file, an annotation set.

**Edge:** A typed, directional relationship between two nodes, optionally specifying an
anchor (section, slide, operation, element) on each end. Edge types include: *implements*,
*specifies*, *references*, *see-also*, *annotates*.

**Anchor:** An addressable location within a node — a heading in Markdown, a slide number
in a deck, an operation ID in an OpenAPI spec, a shape ID in a diagram, a line range in code.

**Graph manifest:** A derived index file (auto-generated, never hand-edited) that materializes
all nodes and edges discovered from embedded links across the `docs/` directory and codebase.
Rebuilt on `weft serve` and on file watch.
