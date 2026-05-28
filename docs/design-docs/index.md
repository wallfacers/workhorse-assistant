# Design Docs — Index

Catalog of design decisions. Each entry has a **validation status** so an
agent can tell at a glance whether the document still reflects reality.

## Validation states

- **proposed** — drafted, not yet implemented.
- **active** — implemented and reflects the current code.
- **historical** — kept for reference; the system has since moved on.
- **stale** — known to be out of date; do not act on it.

## Core

| Doc | Status | Last reviewed | Owner |
| --- | --- | --- | --- |
| [`core-beliefs.md`](./core-beliefs.md) | active | 2026-05-25 | — |

## Areas

_Empty._ Add a new row when an exec-plan introduces a design decision worth
preserving past the plan's lifetime. The plan author writes the design doc;
the index entry below is updated in the same PR.

| Doc | Status | Last reviewed | Owner |
| --- | --- | --- | --- |
| _none yet_ | — | — | — |

## How to add an entry

1. Write the doc as `docs/design-docs/<slug>.md`. Lead with a one-paragraph
   summary and a "Decision" section.
2. Add a row above with the date you reviewed it.
3. On any change to the underlying system that invalidates the doc, either
   update it and bump "Last reviewed", or mark it **stale** in the same PR.
4. The doc-gardener (when built) verifies "Last reviewed" is < 180 days; older
   rows get an automatic stale review request.
