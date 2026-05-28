# Bootstrap Tauri scaffold and harness-style knowledge base

- **Status:** done
- **Owner:** initial-scaffold
- **Created:** 2026-05-25
- **Closed:** 2026-05-25

## Problem

The repository began as an AI Studio React/Vite/Tailwind sketch
("Workhorse Assistant") with a server-side Gemini integration. To run as a
proper desktop product *and* to operate sustainably with AI agents as the
primary contributor, two changes were required:

1. The project needed a real native shell (Tauri v2) with the correct
   process boundary between renderer and core.
2. The repo needed to become its own system of record — a structured `docs/`
   tree the agent can navigate via progressive disclosure, in the style of
   OpenAI's "Harness Engineering" approach.

## Goal

Land a working Tauri v2 scaffold and the full harness-style documentation
spine in a single change, with `docs/DESIGN.md` written to the Google
DESIGN.md format so visual tokens are mechanically checkable.

## Non-goals

- Re-implementing the Gemini API (explicitly dropped at user's request).
- Writing application features beyond a `greet` smoke command.
- Generating application icons or running `npm install` / `cargo build`
  inside the sandbox.

## Approach

- Replace `package.json` to remove the Express/Gemini stack and add the
  Tauri v2 toolchain.
- Add `vite.config.ts` settings recommended by Tauri (port 1420, strict,
  ignore `src-tauri/`).
- Create `src-tauri/` with `Cargo.toml`, `tauri.conf.json`, `build.rs`,
  `src/main.rs`, `src/lib.rs`, and `capabilities/default.json`.
- Create `AGENTS.md` (≤ 100 lines, map only), `CLAUDE.md` (pointer), and
  `ARCHITECTURE.md` (process model + source tree + IPC contract).
- Create the seven top-level `docs/*.md` files and the five `docs/*` index
  subtrees described in the harness post.
- Move the initial design tokens of the existing UI into `docs/DESIGN.md`
  as a Google-DESIGN.md-format document (the "Workhorse" system).

## Steps

- [x] Remove `metadata.json` (AI-Studio-specific) and empty `package-lock.json`.
- [x] Rewrite `package.json` and `vite.config.ts` for Tauri v2.
- [x] Add `src-tauri/` scaffold.
- [x] Add `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`.
- [x] Add `docs/DESIGN.md` (Google format), `FRONTEND.md`, `PLANS.md`,
      `PRODUCT_SENSE.md`, `QUALITY_SCORE.md`, `RELIABILITY.md`, `SECURITY.md`.
- [x] Add `docs/design-docs/`, `exec-plans/`, `generated/`, `product-specs/`,
      `references/` with index/README files.
- [x] Seed `tech-debt-tracker.md` with everything left unimplemented.
- [ ] (Out of scope of this plan; tracked as tech debt) Run `npm install`,
      generate icons, verify `tauri:dev` boot.

## Risks

- **Risk:** Renderer still hard-codes hex values that should come from
  `DESIGN.md`. **Mitigation:** Logged in `tech-debt-tracker.md`; next plan
  wires `design:export:css` and replaces them.
- **Risk:** `tauri:build` will fail without icons. **Mitigation:** Logged in
  `tech-debt-tracker.md` and documented in `src-tauri/icons/README.md`.
- **Risk:** Permissions in `capabilities/default.json` may need expansion as
  features land. **Mitigation:** Process for adding permissions is documented
  in `SECURITY.md`.

## Decision log

- 2026-05-25 — Dropped Express/Gemini per user direction; the scaffold ships
  Rust-only command stubs (`app_info`, `greet`) as the smoke test.
- 2026-05-25 — Chose Google DESIGN.md format over a homegrown token doc so
  the design system is lintable from day one (`npm run design:lint`).
- 2026-05-25 — Kept `AGENTS.md` deliberately short (~100 lines) per the
  harness post's central lesson; all detail moved into `docs/`.
- 2026-05-25 — Did not install dependencies or run `tauri:dev` from the
  agent shell; left as a manual verification step for the user (WSL has
  uncertain webkit2gtk availability).
