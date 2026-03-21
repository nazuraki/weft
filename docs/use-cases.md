# Weft — Use Cases

## UC-1: In-repo documentation navigation
A developer opens a terminal in a project repo and runs `weft serve`. A browser UI opens
showing the document graph. They can navigate from the high-level design doc to the relevant
API spec section to the database schema to the code file that implements it — using the doc
tree, main view, and linked-items sidebar, with each navigation step preserving history so
they can go back.

## UC-2: VSCode side panel
While reading a code file in VSCode, the developer sees gutter annotations where `@doc`
references appear in comments. Clicking an annotation opens the Weft side panel directly
to the referenced document section. The panel is navigable — they can follow links within it
without leaving the editor.

## UC-3: Presentation during a call *(deferred — requires import pipeline)*
A developer is presenting an architecture overview (imported from a Google Slides deck) during
a Zoom call. A stakeholder asks about the behavior of a specific API endpoint. With **presenting
mode** enabled, the developer clicks a link on the slide; a **slide-in modal** opens to the
OpenAPI spec section for that endpoint (without shrinking the main slide view). They answer the
question, dismiss the modal, and continue the deck from where they left off.

## UC-4: Document review / annotation
A reviewer receives a zip of project documentation. They drop it in a folder, run
`weft serve`, and navigate the graph in the browser. They select a paragraph in the
architecture doc, add a comment, and optionally link the comment to a related section elsewhere
("see also: api.yaml#/paths/users"). The tool writes the annotation to a
`architecture.md.weft` sidecar file. The reviewer sends back that file (or the whole
`docs/` folder). The original author drops it in, runs `weft serve`, and sees the
annotations in context: the main view shows the document while **reviewing mode** surfaces
comment history and links in the sidebar layout.

## UC-5: Onboarding a new team member
A new developer runs `weft serve` on day one. Starting from the README or a designated
entry-point doc, they can explore the full project graph — following links from design intent
to implementation to API contract to database schema — without needing a guided tour.

## UC-6: AI agent context during vibe coding
A developer is vibe coding with an AI agent (e.g., Claude Code, Cursor, Copilot) running in
a repo that has a Weft graph. When the agent is about to implement or modify a feature, it
uses a Weft skill/tool to query the documentation graph for relevant context — design intent,
API contracts, database schema constraints, related wireframes. The agent receives structured
results anchored to specific document sections, grounding its code generation in the project's
actual specifications rather than guessing from code alone. As the agent works, it can follow
graph edges to discover related constraints it wouldn't have found by grepping source files.

## UC-7: AI agent updates documentation alongside code
An AI agent completes a code change — adding a new endpoint, changing a database column,
modifying business logic. Before finishing, it queries the Weft graph to find documentation
nodes linked to the code it changed (via `@doc` references and graph edges). It then updates
the affected doc sections — API spec, schema description, architecture notes — to reflect the
new behavior, keeping documentation in sync with code as a natural part of the implementation
workflow rather than a separate chore.

## UC-8: Decision log for significant changes
A developer (or AI agent) is about to make a significant change — replacing an auth strategy,
restructuring a data model, deprecating an API. As part of the change, they append a decision
entry to the relevant documentation node: what changed, why, what alternatives were considered,
and who approved it. The entry is linked to the affected nodes in the graph (API spec, schema,
architecture doc). Over time, the decision log becomes a navigable history of the project's
evolution — anyone can trace from a piece of code to the design decision that shaped it.

## UC-9: PR review flags missing documentation updates
A developer opens a pull request with significant code changes but no corresponding
documentation updates. A CI-integrated agent runs `weft check` against the diff, traverses
the graph to identify documentation nodes linked to the changed code, and detects that those
nodes are now stale. It posts a review comment on the PR listing the specific doc sections
that likely need updating, with links to each one. The developer (or an agent) can then
address the gaps before merge.

## UC-10: Cross-team dependency discovery
A team is about to change a shared API. They query the Weft graph for all nodes referencing
that API's anchors — and discover downstream consumers they didn't know about: another team's
design doc references the endpoint, a wireframe links to the response schema, a functional
spec depends on the current behavior. The graph surfaces blast radius across artifact types
that wouldn't show up in a code-only dependency analysis.

## UC-11: Documentation coverage analysis
A tech lead runs `weft analyze --coverage` to audit the state of project documentation. The tool reports
code files with no `@doc` links, documentation nodes with zero inbound edges (orphaned docs),
and graph regions with sparse connectivity. The output highlights gaps systematically —
undocumented features, stale docs that nothing references anymore, and areas where the
documentation graph is thin relative to the code complexity.

## UC-12: Migration / deprecation impact scoping
A team is planning a large migration — swapping a database engine, replacing an auth framework,
deprecating a service. Before writing code, they query the Weft graph for everything connected
to the component being replaced: API specs, schema docs, architecture notes, decision log
entries, wireframes that reference affected behavior. The result is a complete impact map across
all artifact types, scoping the migration before it begins rather than discovering surprises
mid-flight.

## UC-13: Cross-repo documentation queries *(deferred — requires MCP server)*
An organization runs Weft MCP servers in multiple project repos. An AI agent working in one
repo can query Weft servers across all of them — searching for cross-repo dependencies,
finding which projects consume a shared API, or researching how other teams solved a similar
problem. The agent doesn't need to clone or navigate each repo; it queries each project's
documentation graph as a service and synthesizes results across the organization.

## UC-14: Versioned documentation for releases
A project publishes releases on GitHub. A developer needs to check the API spec as it existed
in v2.3, not the current main branch. They run `weft serve --repo org/project --tag v2.3`
(or select the version in the browser UI). Weft pulls the docs tarball from the GitHub release,
builds the graph, and serves it. The developer can navigate the full documentation graph as it
existed at that release — no need to check out old branches or dig through git history.

## UC-15: Stakeholder review without code access
A non-technical stakeholder receives a `docs/` folder export. They open a hosted static site
(published via `weft build`) or run `weft serve` locally and can navigate the design documents,
wireframes, and functional specs without access to the codebase.
