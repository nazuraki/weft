---
name: write-use-cases
description: >
  Guidance for writing, reviewing, and splitting software use cases. Use this skill whenever
  the user wants to write a new use case, review or critique an existing one, decide whether
  to split a use case into two, evaluate whether something belongs in a use case, or clean up
  a set of use cases for quality and consistency. Trigger on requests like "write a use case",
  "review this use case", "is this too long / should I split this", "what should go in a use
  case", or when the user pastes a use case draft and asks for feedback.
---

# Writing Use Cases Well

A use case describes **what a specific actor achieves** when interacting with a system — not
how the system works internally. The goal is to communicate value from the outside in:
who cares, why they care, and what the system makes possible for them.

The primary reference is Alistair Cockburn's *Writing Effective Use Cases*. The principles
below are distilled from that work and widely accepted practice.

---

## What a use case is

A use case captures one **user goal** at one **level** — a coherent thing an actor sets out
to accomplish in a single sitting (or session). It tells a story with these elements:

| Element | Question it answers |
|---|---|
| **Actor** | Who initiates, and in what role/context? |
| **Trigger** | What situation prompts them to act right now? |
| **Goal** | What are they trying to accomplish? |
| **Flow** | What do they do, and how does the system respond? |
| **Outcome** | What has changed? What value was delivered? |

In a brief use case, actor and trigger typically appear fused in the opening sentence —
"A DevOps engineer is about to change a shared module and needs to understand the blast
radius..." establishes both who and why in one stroke. They're conceptually distinct but
you don't need to separate them artificially.

---

## Use case levels (Cockburn)

Choose the right level before writing. Most product use cases should be **user-goal level**.

- **Summary** — spans multiple sessions or user goals. Useful for stakeholder overviews and
  roadmap framing. Too broad for implementation guidance.
- **User goal** *(the sweet spot)* — one actor, one objective, one sitting. The right level
  for product docs, backlogs, and design specs.
- **Subfunction** — a step inside another use case (e.g., "authenticate"). Write these only
  when reused across multiple user-goal use cases; otherwise fold them in.

---

## Writing the brief format

For most product and design work, a single narrative paragraph is the right format. It is
easy to read, easy to update, and forces you to articulate the story coherently.

**Default to brief unless the scenario genuinely can't be captured concisely.** Resist the
pull toward structured templates with preconditions, numbered steps, and alternative flows —
those belong in high-stakes or contractual specs, not most product docs.

**Structure the paragraph like this:**
1. Open with the actor + situation in one sentence — who they are and what they're about to do
2. Narrate the key interaction steps — what the actor does, what the system enables
3. Land on the outcome: what changed, what the actor now has or knows

**Example of a well-written brief use case:**

> A new developer runs `weft serve` on day one. Starting from the README or a designated
> entry-point doc, they can explore the full project graph — following links from design intent
> to implementation to API contract to database schema — without needing a guided tour.

Notice: actor + trigger fused in the opener (new developer, day one), clear flow (run command
→ navigate graph → follow links), clear outcome (self-directed exploration without a tour).
No internal system mechanics mentioned.

---

## What belongs in a use case

**Include:**
- Observable behavior from the actor's perspective
- The goal and why it matters to the actor
- Key interaction points that shape the experience
- System responses that are meaningful to the actor
- Status notes for deferred features (e.g., *deferred — requires X*)

**Exclude:**
- Internal implementation details ("the system queries the index")
- Database or API mechanics — these belong in design/architecture docs
- Detailed UI choreography ("user clicks the dropdown, selects from list") — summarize intent,
  not clicks
- Technical constraints — those belong in requirements or design decisions
- Non-functional requirements (performance, security) — those are separate

---

## Common anti-patterns

**Technology leak** — mentioning internal mechanics the actor doesn't see.
> ~~"The system sends an HTTP request to the search service and returns a ranked JSON array."~~
> ✓ "The system returns matching results ranked by relevance."

**UI-centricity** — narrating UI mechanics instead of the actor's intent.
> ~~"User clicks the + button, a modal opens, they fill in the Name field and press Save."~~
> ✓ "The developer adds a new linked item from the sidebar."

**No actor** — passive voice with no clear initiator.
> ~~"Documentation is searched and results are displayed."~~
> ✓ "A developer searches documentation and navigates to the matching section."

**Compound goal** — two distinct objectives crammed into one use case.
> ~~"A developer adds annotations to a document and shares the annotated doc with a reviewer."~~
> These are two separate user goals. Split them.

**Missing outcome** — the story ends without stating what changed or why it mattered.
> ~~"A developer runs `weft check` against the diff."~~
> ✓ "...and receives a list of doc sections that are now stale, linked directly to the affected files."

**Too abstract** — no concrete scenario, just category labels.
> ~~"Users can manage documentation."~~
> ✓ Tell a specific story with a specific actor and a specific goal.

**Overly formal** — adding numbered steps, preconditions, alternative flows, and postconditions
when a paragraph would do. This buries the story in scaffolding and makes the use case harder
to read and update. Default to brief.

---

## When to split a use case

Split when the use case contains **two independently valuable goals**. A good test: could
each half stand alone as a useful outcome for the actor, even if the other half weren't done?
If yes, split.

**Split when:**
- There are two distinct actor goals joined by "and also..."
- The narrative has a natural break where the actor's objective has already been achieved
- Different primary actors are involved in different parts
- One scenario is dramatically simpler and doesn't need the complexity of the other

**Don't split when:**
- You're describing variant flows of the same goal (keep as one use case with extensions noted)
- Steps are sequential and only make sense together (that's one goal, not two)
- The same actor is doing similar things in different contexts — that's a variant, not a new use case

**When to note as deferred** — if a use case is valid but depends on infrastructure that
doesn't exist yet, keep it in the set and mark it: *deferred — requires [missing capability]*.
This preserves design intent without pretending the capability is available.

---

## Reviewing an existing use case

Run through these questions:

1. **Actor + trigger** — Does the opening establish who is acting (named role, not "a user")
   and what situation prompted them? These usually appear together — treat them as one check.
2. **Goal** — Is it clear what they're trying to accomplish and why it matters?
3. **Flow** — Is the sequence coherent and told from the actor's perspective?
4. **Outcome** — Does the use case land on a concrete result or value delivered?
5. **Scope** — Is this one goal, or two? (If two, flag for splitting)
6. **Level** — Is it user-goal level, or has it drifted to subfunction or summary level?
7. **Leakage** — Does it mention implementation details, UI mechanics, or technical internals?
8. **Abstraction** — Is it specific enough to be meaningful, or too vague to act on?
9. **Format** — Is it a clean narrative paragraph, or has it grown structured scaffolding
   (numbered steps, preconditions, alternative flows) that isn't warranted?
10. **Consistency** — Does it match the style and granularity of sibling use cases in the set?

When providing a review, always end with a concrete rewrite — not just a list of problems.

---

## Numbering and sets

When working with a numbered set (UC-1, UC-2, etc.):
- Assign the next available number when adding
- Don't renumber existing use cases — stable IDs allow linking and referencing
- When splitting a use case, keep the original ID on the primary piece and assign a new ID to the split-off piece
- Group by theme if the set is large (but IDs stay globally sequential)

---

## Format variants

| Format | When to use |
|---|---|
| **Brief** (1 paragraph) | Product docs, early exploration, stakeholder communication — the default |
| **Casual** (2–3 paragraphs) | When a single paragraph feels compressed for a complex flow |
| **Fully dressed** (structured template with extensions, preconditions, etc.) | High-stakes systems, contractual specs, complex alternate flows |

Default to brief. Only go fuller when there's a genuine reason the story can't be told in a paragraph.
