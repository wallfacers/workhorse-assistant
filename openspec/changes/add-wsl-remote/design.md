# Design — add-wsl-remote

> Companion to [`proposal.md`](./proposal.md). This document exists mainly to
> make the **delivery order** unambiguous: almost every deferred item across
> `add-project-sessions` and this change is gated on the same handful of sidecar
> endpoints. Build them in the order below and the assistant lights up in stages
> with no rework.

## The dependency graph (why order matters)

The assistant bridge already *calls* every endpoint below (compiled + unit
tested in `add-project-sessions`). Nothing on the assistant side is blocked by
the assistant — it is blocked by the Go sidecar. Each sidecar endpoint unlocks a
concrete assistant feature that is otherwise dead/degraded.

```
SIDECAR ENDPOINT (Go)                    UNLOCKS (assistant — code already in place)
─────────────────────────────────────   ───────────────────────────────────────────
GET  /v1/sessions?workdir=       ──────▶ switcher shows persisted sessions of a project
GET  /v1/sessions/{id}/history   ──────▶ • switch to a non-live session (rebuild)
                                         • §3.5 memory eviction (revisit → rebuild)   ┐
GET  /v1/projects                ──────▶ project dropdown shows real projects          │ batch 1
PATCH/DELETE /v1/sessions/{id}   ──────▶ rename / delete in the ⋯ menu                  │ (no WSL
tool_call_done {output,error}    ──────▶ tool results visible in the transcript        │  needed)
                                                                                       ┘
GET  /health { default_workdir } ──────▶ • cold start with no host-cwd fallback (§1.7) ┐
                                         • zero-friction first launch                   │ batch 2
/health capabilities {platform,  ──────▶ UI defaults terminal to `wsl`, knows it is    │ (WSL
              distro}                      talking to a remote sidecar                  │  enablement)
GET  /v1/fs/list?path=           ──────▶ namespace-correct project browser             ┘
```

```
DELIVERY ORDER
  batch 1 ─ sessions/history/projects/rename/delete + tool output
            → finishes add-project-sessions end-to-end (no WSL involved)
                 │
                 ▼
  batch 2 ─ /health default_workdir + capabilities + fs/list
            → enables this change (WSL remote)
                 │
                 ▼
  assistant-side WSL work (terminal profile, §1.7 flip, decoupling) — see tasks.md
```

**Read this as: do not start the assistant-side WSL work until batch 2 endpoints
exist, and do not bother polishing the project switcher / eviction until batch 1
exists.** The one thing the assistant *can* do with zero sidecar support — a
localStorage recent-projects list — already shipped (commit `9385a0c`).

## Decisions

- **D-WSL-1 — §1.7 lives here, not in `add-project-sessions`.** Dropping the
  Rust host-cwd fallback requires an explicit `workdir` at all times; keeping
  zero-config startup then requires `/health default_workdir`, which only lands
  with the WSL capabilities. Flipping §1.7 earlier would break "open app → chat".
- **D-WSL-2 — Cold start: sidecar-provided default, not host detection.** The
  assistant never guesses a path. Order of precedence: remembered last project →
  `/health default_workdir` → project picker. The renderer stays namespace-blind.
- **D-WSL-3 — Project paths are sidecar-namespace opaque strings.** No
  `\\wsl$\` ↔ `/…` translation in the sidecar; if translation is ever needed it
  lives on the assistant side only. Prefer sidecar-served enumeration
  (`fs/list`) so the picker is namespace-correct by construction.
- **D-WSL-4 — Full health/session decoupling rides along here.** The §3.6
  follow-up (`useAgentConnection` → pure health probe; per-session
  `connection_failed` re-open instead of minting a new session) is only worth
  doing once a remote sidecar makes connection drops common and once startup is
  picker-driven. Until then, the store-layer bootstrap-replacement fix (shipped
  in `add-project-sessions`, commit `127dbfd`) keeps B3 contained.
- **D-WSL-5 — Terminal is the 80% solution.** `wsl.exe -d <distro> --cd <path>`;
  the PTY stays on the Windows host, the shell process is the WSL bridge. No
  server-side PTY (out of scope). **Caveat:** the PTY layer currently has no way
  for the renderer to pass a target `workdir`/`distro` — `resolve_profile` takes
  only a `profile_id` and `ProfileId` is a closed union. C2 must add a `workdir`
  channel through `pty_spawn` → `SessionRegistry::spawn` → `resolve_profile` and
  extend `ProfileId` with `wsl`; this is the largest engineering item in the change.
- **D-WSL-6 — `platform`/`distro` are top-level `/health` fields, not `capabilities`.**
  `capabilities` is a flat `Vec<String>` feature-flag list and cannot carry
  key→value scalars. `platform`/`distro` join `default_workdir` as new optional
  top-level fields on `HealthInfo` (Rust + TS). These additions are **additive and
  backward-compatible** and MUST NOT bump `protocol_version` (so
  `wire-reasoning-stream`'s `"1"` handshake precheck stays valid).

## Cross-change ledger (what moved where)

| Item | From | Status |
| --- | --- | --- |
| §1.7 explicit workdir | add-project-sessions §3.6 | → here (D-WSL-1) |
| `useAgentConnection` decoupling | add-project-sessions §3.6 | → here (D-WSL-4) |
| §3.5 memory eviction | add-project-sessions | stays in that change; **gated on `GET /history`** |
| Native folder picker | add-project-sessions §4.5 | → here (`fs/list`, D-WSL-3) |
| Settings editable endpoint | add-project-sessions §4.6 | → here |
| `tool_call_done` output (sidecar half) | add-project-sessions C1/T6 | batch 1 above |

## Open questions (unchanged from proposal)

- Path translation vs. fully sidecar-served enumeration — pick one (leaning
  enumeration, D-WSL-3).
- One sidecar/distro at a time, or a remote switcher alongside the project switcher?
- Does the assistant ever render a host-Windows path once a remote project is open?
