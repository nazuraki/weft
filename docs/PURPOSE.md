# Purpose

Weft exists because project knowledge rots when it lives outside the repository.

Design docs drift from the code. API specs fall out of sync with implementation. Architecture diagrams become historical artifacts. Decisions get re-litigated because no one can find where they were recorded. The documents exist — they're just scattered, disconnected, and invisible from where the work happens.

## The Problem

Existing tools treat documentation as a publishing problem: write it somewhere, link to it once, hope people find it. The result is a pile of documents with no navigable structure. Readers can't tell how a feature spec relates to its implementation, which decision log entry explains a design choice, or where a wireframe was refined into an API contract.

The gap isn't content — it's the graph of relationships between content.

## What Weft Does

Weft is a documentation graph browser that lives in the repository alongside the code.

All project artifacts — design docs, architecture diagrams, API specs, database schemas, wireframes, slide decks, functional specs — become nodes in a navigable graph. Typed, anchor-level edges connect them: *this use case is implemented by that API operation; this decision record specifies this schema; this wireframe annotates that section.*

Any document can be the entry point. Navigation is a first-class interaction, not an afterthought.

## Design Constraints

- **Repository-native.** Weft indexes the `docs/` directory and codebase in place. No external service, no separate content store.
- **Standard formats.** Markdown links stay standard Markdown — they render on GitHub and in any editor. Weft identifies graph edges by resolving them, not by requiring a custom syntax.
- **Derived, not hand-maintained.** The graph manifest is auto-generated. Humans write documents; Weft builds the graph.
- **Any document as entry point.** The reader's current document always has full context: what it implements, what specifies it, what references it.

## What It Is Not

Weft is not a wiki, a knowledge base SaaS, or a static site generator. It does not replace writing. It does not manage content in a database. It does not require migrating documents out of the repository.

It is a browser for the graph that already exists, made explicit.
