# QUALITY_SCORE.md

A rubric for grading each area of the codebase. We score on a 0–5 scale and
re-score on every meaningful change to that area. The score history is what
flags drift before it becomes debt.

## Areas

| Area | Owner | Current | Target |
| --- | --- | --- | --- |
| Renderer shell (`src/App.tsx`, layout) | — | 2 | 4 |
| Renderer components (`src/components/`) | — | 2 | 4 |
| IPC layer (`src/ipc/`) | — | 0 (not built) | 3 |
| Rust core (`src-tauri/src/`) | — | 1 | 3 |
| Design system (`docs/DESIGN.md`) | — | 3 | 4 |
| Docs (`docs/`, `AGENTS.md`) | — | 3 | 4 |
| Build & bundle | — | 2 | 3 |
| Security posture | — | 2 | 4 |
| Reliability / error handling | — | 1 | 3 |
| Tests | — | 0 (none) | 3 |

Re-score whenever you finish an exec-plan that touches the area.

## The 0–5 scale

Each level is **inclusive of** all lower levels.

- **0 — Absent.** Not implemented. Score this only if the area *should* exist
  and does not.
- **1 — Works on the happy path.** It compiles, the simplest case passes
  manual testing, but edge cases and errors are unhandled. No tests.
- **2 — Covers the obvious failure modes.** Inputs are validated, the unhappy
  path returns a sensible message, the code is readable, basic smoke testing
  is done.
- **3 — Production-shippable.** Errors are typed and recovered or surfaced;
  there is at least one automated test that proves the contract; the code
  reads cleanly to a stranger.
- **4 — Polished.** The interface is small and obvious, the implementation is
  isolated, tests cover the contract *and* one regression. A new contributor
  can change it safely on day one.
- **5 — Excellent.** All of 4, plus: instrumented (logs/metrics where they
  matter), profile-tested on realistic input, documented with an example.
  Reserved for areas that *deserve* a 5 — most areas should target 4.

## Scoring rules

1. **Score honestly.** A "2 that we think is a 3" is worse than a documented
   "2 we plan to fix." The honest score is the actionable score.
2. **Tests are required for ≥ 3.** No automated test = max 2, regardless of
   how clean the code looks.
3. **Drift triggers a re-score.** If you read code in an area and notice it is
   below its recorded score, update the table in the same change.
4. **Targets are commitments.** A target with no exec-plan behind it after 60
   days is fiction; either land a plan or lower the target.

## How agents use this file

When the agent picks up work in an area:

1. Read the row for that area.
2. If the proposed change would *raise* the score, mention it in the
   exec-plan and re-score on close.
3. If the proposed change would *lower* the score (e.g., adding an untested
   code path to a 3-rated area), the exec-plan must include the path back to
   the original score, or the target must be lowered explicitly.

This is the mechanism that prevents quiet decay.
