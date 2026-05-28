# PLANS.md

How we plan work. Following this is what keeps the agent from sprinting into
the wrong wall.

## When to write a plan

| Change | Plan? |
| --- | --- |
| Typo, dead-link, one-line fix | No |
| Bug fix touching ≤ 2 files | No |
| New feature, refactor, schema change | **Yes — exec-plan** |
| Anything > 1 hour of work | **Yes — exec-plan** |
| Anything that touches > 1 domain layer | **Yes — exec-plan** |
| Cross-cutting cleanup (dependency bump, lint rule) | **Yes — short exec-plan** |

When in doubt, write the plan. The cost is ~10 minutes; the cost of *not*
writing it is the agent silently re-interpreting the request mid-execution.

## Exec-plan lifecycle

```
docs/exec-plans/
├── active/        ← currently in flight; one folder per plan
├── completed/     ← merged plans, append-only history
└── tech-debt-tracker.md
```

1. **Draft.** Create `docs/exec-plans/active/YYYY-MM-DD-<slug>.md` from the
   template below. Commit it before writing code.
2. **Execute.** Tick checkboxes as you go. Append decisions to the
   "Decision log" section as they happen.
3. **Close.** When the work is merged, move the file to `completed/` in the
   same commit. Do not delete plans — the trail of decisions is the asset.

## Plan template

```markdown
# <Slug>

- **Status:** draft | in-progress | done
- **Owner:** <name>
- **Created:** YYYY-MM-DD
- **Closed:** YYYY-MM-DD (filled at close)

## Problem
One paragraph. What is wrong / missing today. Concrete evidence: file paths,
error messages, screenshots. Not "users want X" — "today the X flow does Y
which breaks Z."

## Goal
One sentence. The smallest change that resolves the problem.

## Non-goals
Bullet list. What this plan explicitly will **not** do. This is where the
agent gets reined in.

## Approach
2–5 bullets. The shape of the solution, not the diff. Pointers to the files
that will change.

## Steps
- [ ] Step 1 — concrete, verifiable
- [ ] Step 2 — ...
- [ ] Update docs (which ones?)
- [ ] Run `npm run lint` / `cargo check`
- [ ] Open PR with this plan referenced

## Risks
What could go wrong; how we'd notice; rollback plan.

## Decision log
- YYYY-MM-DD — Chose A over B because ...
```

## Lightweight plans

For small but non-trivial work (a tricky one-file fix, a dependency bump
with a known break), use a **lightweight plan**: a single fenced block at
the top of the PR description that contains *Problem / Goal / Steps*. No
file under `docs/exec-plans/` needed. This is the off-ramp for the "Yes —
short exec-plan" row above when the work truly is small.

## Tech debt

Anything that is "we should fix this later" goes into
[`exec-plans/tech-debt-tracker.md`](./exec-plans/tech-debt-tracker.md) the
moment it is identified, even mid-PR. The format:

```
- [ ] <one line> — discovered YYYY-MM-DD in PR #N — see <file>:<line>
```

A tech-debt entry that has been open > 90 days is itself a problem; the
doc-gardener (when we build it) will surface those.

## Plan quality bar

A good exec-plan reads like a contract: a reviewer who has not seen the
problem can read it and predict, within ~10%, what files will change and
why. If your draft does not pass that bar, it is too vague.
