# Core Beliefs

These are the **agent-first operating principles** that shape every other
document in this repo. They are non-negotiable; conflicting suggestions lose.

If you are an agent reading this for the first time, internalise these
before touching code. If you are a human contributor, treat changes to this
file as constitutional amendments — they require a dedicated exec-plan, not
a drive-by edit.

---

## 1. The repository is the system of record

Anything not committed to this repo **does not exist** for the agent.

- Specs in chat, decisions in Google Docs, knowledge in a maintainer's head
  — invisible.
- The right move when a useful fact appears in conversation is to write it
  into the appropriate doc in the same change.

> Corollary: PRs that change behaviour without updating docs are incomplete.

## 2. AGENTS.md is a map, not a manual

The instruction surface the agent sees first should be small (~100 lines),
stable, and entirely composed of pointers. Detail lives in the doc the
agent navigates to.

> Symptom we are avoiding: an `AGENTS.md` that has grown to 800 lines of
> "remember to…" notes that contradict each other.

## 3. Progressive disclosure

The agent should pull in deeper context **only for the work at hand**.

- Reading every doc up-front is wasteful and crowds out the task.
- The structure of `docs/` exists so the right next doc is one obvious link
  away.

## 4. Optimise for agent readability

Treat the agent as a new contributor who arrives every session with full
fluency in the languages but zero memory of yesterday.

- Concrete file paths beat abstract descriptions.
- Tables beat prose for enumerable facts.
- Examples beat exhortations.
- A doc that cannot be skimmed in 2 minutes is too long.

## 5. Documents have an author and an owner, even if both are you

Every meaningful doc has a row in some index (`docs/design-docs/index.md`,
`docs/product-specs/index.md`, or the table in `docs/QUALITY_SCORE.md`).
Orphan docs rot.

## 6. Plans are first-class artefacts

A non-trivial change without a plan is a guess. The plan goes into
`docs/exec-plans/active/` **before** the code change. Plans are kept (in
`completed/`) after merge — the audit trail is the asset.

See [`../PLANS.md`](../PLANS.md) for the lifecycle.

## 7. Mechanical checks beat exhortation

Anywhere we can replace a "remember to…" rule with a linter, CI check, or
doc-gardener bot, we do. Examples already in place:

- `npm run design:lint` validates `docs/DESIGN.md`.
- `npm run lint` (`tsc --noEmit`) is the type-check gate.

Examples planned (tracked as tech debt):

- Doc freshness checker on `design-docs/index.md`.
- Cross-link validator (no broken `[text](./path)` references).
- "Score honest?" reminder when QUALITY_SCORE.md goes >60 days unchanged.

## 8. The renderer is a guest

The trust boundary runs through the IPC bridge. The Rust core never trusts
its input; the renderer never trusts the model's output. See
[`../SECURITY.md`](../SECURITY.md).

## 9. Quietness is a feature

We do not chase engagement metrics or surface gratuitous animation. The
patient power user wants their assistant to *get out of the way*. If a
proposed change makes the UI louder, the burden of proof is high.

See [`../PRODUCT_SENSE.md`](../PRODUCT_SENSE.md).

## 10. Decay is the default

Every document and every score in this repo decays over time. The work of
keeping the system of record honest is **continuous** — not a one-time
documentation sprint. Budget for it on every exec-plan.
