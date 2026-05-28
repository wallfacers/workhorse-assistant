# CLAUDE.md

This file exists so that Claude Code picks up the project context.

**The canonical agent guidance for this repository lives in
[`AGENTS.md`](./AGENTS.md).** Read it first, then follow its pointers into
[`docs/`](./docs) for deeper detail.

## TL;DR for Claude

- Start at [`AGENTS.md`](./AGENTS.md) — it is intentionally short and maps to
  everything else.
- Treat the repository as the **system of record**. If a constraint is not in
  code or `docs/`, it does not bind the agent. Update docs in the same change
  that changes behaviour.
- Do not hand-tune visual values; change [`docs/DESIGN.md`](./docs/DESIGN.md)
  and re-export Tailwind tokens.
- Non-trivial work (≥1 hour or >1 file) gets a written plan under
  [`docs/exec-plans/active/`](./docs/exec-plans/active/) before code changes.

## Commands Claude should know

```bash
npm install            # one-time
npm run lint           # type-check (gate before any commit)
npm run dev            # renderer in a browser (fast iteration)
npm run tauri:dev      # full desktop app (slow first compile)
npm run design:lint    # validate docs/DESIGN.md
```

## Out of scope

- Do **not** add network/Gemini/OpenAI calls from the renderer. Privileged work
  routes through Rust commands in [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs).
- Do **not** create top-level docs without adding a link to
  [`AGENTS.md`](./AGENTS.md) — orphan docs rot.
