# SECURITY.md

A pragmatic threat model and the specific rules that follow from it. This
document is the gate every privileged change passes through.

## What we are protecting

In priority order:

1. **The user's conversations and files.** They contain whatever the user
   trusted the assistant with — possibly years of thinking.
2. **The user's API keys / credentials.** Compromise means surprise bills
   and account-level pivot.
3. **The user's machine.** A compromised assistant with file/system access is
   a more interesting attack surface than a compromised browser tab.

We are **not** protecting a multi-tenant service; there is no "other user" to
pivot to. We are protecting one human's local trust boundary.

## Trust boundaries

```
┌───────────────────────────────────────────────────────────┐
│  Untrusted: model output, fetched web content, user files │
│  ─────────────────────────────────────────────────────────│
│  Semi-trusted: renderer (WebView) — runs our own code but │
│   renders untrusted strings                                │
│  ─────────────────────────────────────────────────────────│
│  Trusted: Rust core, OS keyring, local DB                 │
└───────────────────────────────────────────────────────────┘
```

The arrows of trust point **inward**. The core never trusts the renderer's
inputs; the renderer never trusts the model's outputs.

## Hard rules

### Secrets

- **API keys live in the OS keyring** (via a Tauri plugin, TBD). Never in
  `localStorage`, never in `.env`, never in plaintext on disk.
- **Secrets never enter the renderer.** Commands that need to call upstream
  APIs do so from Rust; the renderer asks "please call X" and gets a result,
  never the key.
- **Secrets are never logged.** Period.

**Scoped exception — `~/.claude/settings.json.*` (since the embedded
terminal).** Claude Code's own vendor-routing files (e.g.
`settings.json.cc_w`, `settings.json.glm_w`) hold plaintext tokens on disk.
These are the user's *pre-existing* Claude Code configuration, not a secret
store this app creates. The embedded-terminal launch profiles point `claude` at
one of them via `--settings <path>`; the file is read only by the spawned
`claude` child process and **never** by the renderer or by our own Rust code.
This is in tension with the "never in plaintext on disk" rule above, so it is
recorded here as an explicit, scoped exception. Real hardening (keyring,
settings generated at launch) is deferred to a later stage.

### Permissions

Tauri v2 capabilities are enumerated explicitly in
[`../src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json).
Default grants:

- `core:default` — required for window lifecycle.
- `opener:default` — required to open URLs in the user's browser.

**Adding a permission is a security change.** It must be:

1. Justified in the exec-plan that adds it.
2. Added to this file's table below.
3. Reviewed by a human, not waved through.

| Permission | Granted | Reason |
| --- | --- | --- |
| `core:default` | yes | Tauri runtime baseline |
| `opener:default` | yes | "Open in browser" links from chat |
| `fs:*` | **no** | Not yet justified |
| `shell:*` | **no** | Not yet justified |
| `http:*` | **no** | Network goes through typed Rust clients |

### Process spawning (embedded terminals)

The `pty_spawn` / `pty_write` / `pty_resize` / `pty_kill` commands let the core
spawn and drive child CLI processes (Claude Code, Codex, …) attached to a
pseudo-terminal. This is a genuinely powerful capability, so its boundary is
spelled out here:

- **Spawning happens only in the Rust core.** The renderer cannot spawn a
  process or read a vendor settings file directly.
- **The renderer passes a `profile_id`, never a command line.** The command and
  arguments are resolved core-side from a fixed profile map; the
  (semi-trusted) renderer cannot influence what binary runs or with what flags.
- **No new Tauri capability is involved.** App-defined `#[tauri::command]`
  handlers are *not* gated by Tauri v2's capability/permission ACL — that ACL
  governs only plugin and core commands (`app_info` / `greet` already work with
  no entry). So `capabilities/default.json` is unchanged; this prose is the
  record of the new power instead. Event listening (`listen('pty://…')`) is
  already covered by the existing `core:default` grant.

Note this differs from the table above: those rows are real ACL permission
tokens; process spawning rides on app commands, which the ACL does not cover.
Treat this section as the human-reviewed justification an ACL grant would
otherwise carry.

### Content Security Policy

`tauri.conf.json` currently sets `csp: null` for dev velocity. **Before
shipping v0.1.0**, set a strict CSP:

- `default-src 'self'`
- `script-src 'self'`
- `style-src 'self' 'unsafe-inline'` (Tailwind inline styles)
- `connect-src 'self' tauri:` (extend per-feature)
- `img-src 'self' data:`

This is tracked in [`exec-plans/tech-debt-tracker.md`](./exec-plans/tech-debt-tracker.md).

### Rendering untrusted strings

- Message bodies are rendered as **text by default**, not HTML.
- Markdown rendering (when introduced) uses a sanitiser that strips
  `script`/`iframe`/`object`/`embed` and disallows `javascript:` URLs.
- Code blocks are syntax-highlighted but never executed.
- Links open via the `opener` plugin, which goes through the OS browser
  rather than the WebView's navigation.

### Network

- All outbound HTTP from the Rust core uses a single configured `reqwest`
  client (TBD) with:
  - explicit timeouts (see [`RELIABILITY.md`](./RELIABILITY.md));
  - HTTPS only;
  - certificate validation enabled (no "skip verify" knob);
  - a curated allowlist of hosts for non-user-initiated calls.

- The renderer **never** makes direct `fetch()` calls to third-party hosts.
  Route through a Rust command.

### Files

- Reads/writes happen only within the user's chosen workspace directory.
- The workspace path is resolved once at startup and stored as an absolute
  canonical path; subsequent operations join against it and reject any path
  that escapes it after canonicalisation.

### Telemetry

- **None by default.** No analytics, no crash uploads, no "anonymous usage."
- If we ever add opt-in diagnostics, it ships behind a setting the user can
  read and toggle, with the exact payload visible in the UI before send.

## Threats we are explicitly **not** mitigating

- A user who runs an arbitrary binary as their assistant. (Out of scope —
  any local code can read the same files we can.)
- A user whose OS is compromised. Keyring secrets are at the mercy of the
  OS; we can't fix that from userspace.
- Adversarial prompt injection. Mitigation is *layered*: see [`PRODUCT_SENSE.md`](./PRODUCT_SENSE.md)'s
  "would this surprise a user?" rule and the "render as text" default above.
  We do not claim a robust defense.

## Disclosure

This is a single-author project at v0.x. There is no formal disclosure
process yet. Issues should be opened privately to the maintainer until a
process exists. See [`tech-debt-tracker.md`](./exec-plans/tech-debt-tracker.md).
