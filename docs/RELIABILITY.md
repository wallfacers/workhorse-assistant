# RELIABILITY.md

A desktop app that crashes loses the user's session. A desktop AI app that
crashes loses the user's *thought*. We optimise reliability accordingly.

## Failure modes we care about

In rough order of impact:

1. **Data loss.** Unsent message, unsaved edit, partial write to disk.
2. **Silent corruption.** A field saved in the wrong format that the next
   version cannot read.
3. **Hung UI.** The renderer is alive but unresponsive — worse than a crash
   because the user cannot tell whether their last action was applied.
4. **Hard crash.** Process exits.
5. **Stale state.** UI shows yesterday's data after waking from sleep.

## Principles

### 1. Disk first, UI second

Any user input that represents intent (sending a message, renaming a thread,
toggling a setting) is **persisted before** the UI confirms success. If the
process dies between persist and UI update, the next launch shows the user's
intent intact.

### 2. Conversations are append-only

The on-disk representation of a conversation is an append-only log of events,
not a mutable blob. Edits are new events. This makes corruption recoverable
(replay until the bad event) and makes future sync feasible.

### 3. Every async surface has a timeout

Tauri commands, fetches, model calls — none of them are allowed to wait
forever. A timed-out call surfaces a cancellable error to the user, with the
option to retry. The timeout values live in `src-tauri/src/config.rs` (TBD).

### 4. The renderer is **untrusted**

The Rust core never assumes the renderer sent well-formed input. Every command
validates its arguments at the boundary using `serde` + explicit range checks.
A malformed payload returns an error, never panics.

### 5. Recover, don't restart

A panic in a Tauri command must not bring down the whole app. We wrap command
bodies in `catch_unwind` (TBD util) and convert panics into structured errors.

## Error taxonomy

We distinguish four kinds of errors in the IPC contract:

| Kind | Shape | UI treatment |
| --- | --- | --- |
| `validation` | bad input from renderer | inline field error |
| `not_found` | requested entity absent | empty-state UI |
| `transient` | network/IO; safe to retry | toast with retry |
| `internal` | bug; should not happen | toast + offer to copy diagnostics |

The renderer pattern-matches on `kind`. The `message` is for humans; never
parse it.

## Logging

- **Renderer:** `console.error` for unexpected; nothing for routine.
- **Core:** `tracing` (TBD) → rolling file in the OS log directory.
- **No PII in logs.** No message bodies, no file paths beyond the workspace
  root, no API keys (ever).

## Crash behaviour

On hard crash the next launch:

1. Detects the prior session's incomplete shutdown flag.
2. Re-opens the last-active conversation, scrolled to the point of crash.
3. Shows an unobtrusive banner: "Last session ended unexpectedly. [View
   diagnostics]."

We do **not** auto-report. The user opts in per-incident.

## Backups & recovery

- The on-disk database (TBD; likely SQLite) is rotated on every minor version
  bump: `db.sqlite` → `db.sqlite.bak-<version>`.
- A failed migration restores from `.bak-<version>` and refuses to start
  rather than silently mangling data.

## What this document does **not** cover

- Performance budgets — see [`QUALITY_SCORE.md`](./QUALITY_SCORE.md).
- Threat model — see [`SECURITY.md`](./SECURITY.md).
- UI for error states — see [`FRONTEND.md`](./FRONTEND.md).
