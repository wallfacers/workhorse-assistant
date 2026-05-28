# ARCHITECTURE.md

Top-level map of how Workhorse Assistant is layered. Read this **before**
proposing structural changes. For visual tokens see [`docs/DESIGN.md`](./docs/DESIGN.md);
for renderer conventions see [`docs/FRONTEND.md`](./docs/FRONTEND.md).

## Process model

Workhorse Assistant is a **Tauri v2 desktop application**. At runtime it is
two cooperating processes:

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer process (WebView)                                     │
│  ├─ React 19 + TypeScript                                       │
│  ├─ Tailwind v4 (tokens generated from docs/DESIGN.md)          │
│  └─ Talks to backend via @tauri-apps/api `invoke()`             │
└──────────────────────────────┬──────────────────────────────────┘
                               │ IPC (Tauri command bridge)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Core process (Rust)                                            │
│  ├─ Tauri runtime (window mgmt, lifecycle, OS integration)      │
│  ├─ Commands  — `#[tauri::command]` handlers                    │
│  ├─ Plugins   — opener (and future capabilities)                │
│  └─ Domain    — business logic (secrets, FS, network)           │
└─────────────────────────────────────────────────────────────────┘
```

The **renderer is sandboxed**. Everything privileged — network calls, secret
storage, file access, OS integrations — happens in the Rust core and is
explicitly exposed as a command.

## Source tree

```
.
├── src/                          # Renderer
│   ├── main.tsx                  # React entry
│   ├── App.tsx                   # Top-level layout (3-pane shell)
│   ├── components/               # Presentational components
│   │   ├── Sidebar.tsx
│   │   ├── RightPanel.tsx
│   │   ├── Terminal.tsx          # S0 single embedded PTY (xterm leaf)
│   │   └── terminal/             # S1 multi-terminal workspace (renderer-only)
│   │       ├── TerminalWorkspace.tsx   # useReducer state tree + shell
│   │       ├── TabBar.tsx              # group tabs + `+▾` picker
│   │       ├── ProfileMenu.tsx         # profile picker (yields ProfileId)
│   │       ├── TerminalGroup.tsx       # in-group pane grid
│   │       ├── workspaceReducer.ts     # Workspace/Group/Pane reducer
│   │       └── profiles.ts             # PROFILE_LABELS / PROFILE_ORDER
│   ├── types.ts                  # Renderer-only shared types
│   └── index.css                 # Tailwind v4 entry; imports design tokens
│
├── src-tauri/                    # Rust core
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Window, bundle, identifier, CSP
│   ├── build.rs
│   ├── capabilities/             # Permission grants per-window
│   │   └── default.json
│   ├── icons/                    # Bundle icons (generated, not committed)
│   └── src/
│       ├── main.rs               # Entry, sets windows_subsystem in release
│       └── lib.rs                # Commands + `run()` builder
│
├── docs/                         # System of record (see AGENTS.md)
├── AGENTS.md                     # Map for agents & contributors
├── CLAUDE.md                     # Claude Code pointer to AGENTS.md
├── ARCHITECTURE.md               # ← you are here
└── README.md                     # Human getting-started
```

## Domain layers (current)

The codebase is small. As it grows, follow these layer rules:

| Layer | Lives in | Allowed to depend on |
| --- | --- | --- |
| **UI primitives** | `src/components/ui/` (TBD) | nothing app-specific |
| **Feature panes** | `src/components/` | UI primitives + types |
| **Renderer state** | `src/state/` (TBD) | types + tauri-api |
| **IPC adapters** | `src/ipc/` (TBD) | `@tauri-apps/api` only |
| **Rust commands** | `src-tauri/src/lib.rs` | domain modules |
| **Rust domain** | `src-tauri/src/domain/` (TBD) | std + 3rd-party crates |

A dependency arrow may only point **down** this table. Reverse imports require
a new exec-plan that explicitly justifies the inversion.

## IPC contract

The renderer and core agree on a **command-shaped IPC contract**:

- Commands are declared in `src-tauri/src/lib.rs` with `#[tauri::command]`.
- They are registered via `invoke_handler(tauri::generate_handler![...])`.
- Inputs and outputs are JSON-serialisable (`serde`).
- The renderer calls them via:
  ```ts
  import { invoke } from '@tauri-apps/api/core';
  const info = await invoke<AppInfo>('app_info');
  ```
- Renderer types for IPC live in `src/ipc/` and mirror the Rust structs.

Currently registered commands:

| Command | Signature | Purpose |
| --- | --- | --- |
| `app_info` | `() -> AppInfo` | Self-introspection (version, name) |
| `greet` | `(name: string) -> string` | Smoke-test placeholder |
| `pty_spawn` | `(profileId: string, cols?: u16, rows?: u16) -> session_id: string` | Spawn a PTY-backed CLI from a launch profile |
| `pty_write` | `(sessionId: string, data: string) -> ()` | Forward keystrokes to a session's PTY |
| `pty_resize` | `(sessionId: string, cols: u16, rows: u16) -> ()` | Resize a session's PTY to the viewport |
| `pty_kill` | `(sessionId: string) -> ()` | Terminate a session and free it |

The PTY commands also emit per-session events the renderer subscribes to:

| Event | Payload | Meaning |
| --- | --- | --- |
| `pty://output/{session_id}` | `{ data: string }` | A UTF-8 output chunk (ANSI preserved) |
| `pty://exit/{session_id}` | `{ code: i32, signal?: string }` | The child exited |

See [`docs/SECURITY.md`](./docs/SECURITY.md) for why process spawning needs no
new capability and how the renderer/core boundary is kept (renderer sends only
a `profileId`). The PTY backend lives in `src-tauri/src/pty/`.

### Multi-terminal workspace (renderer-only)

The center pane is a **terminal workspace** (`src/components/terminal/`) that
composes the S0 PTY contract above — tabbed **groups**, an in-group grid
**split**, and a profile picker. It adds **no Rust, no IPC, and no capability**:
each pane is an S0 `Terminal` leaf that owns its own `pty_*` calls and
per-session `pty://…` subscription, so N terminals are pure composition. State
is a renderer-only `useReducer` tree (`workspaceReducer.ts`); the client-side
ids are React/lookup keys, never PTY session ids. Inactive groups stay mounted
but hidden (`display:none`) so their agents keep running; only mount/unmount
(create/close) ends a session. See the S1 change
`openspec/changes/add-multi-terminal-workspace`.

## Permissions & capabilities

Tauri v2 permissions are explicit. The `main` window's grants live in
[`src-tauri/capabilities/default.json`](./src-tauri/capabilities/default.json).
Every new privileged plugin requires:

1. Adding the crate to `Cargo.toml` and the JS plugin to `package.json`.
2. Initialising it in `lib.rs` (`.plugin(...)`).
3. Adding the permission token to `capabilities/default.json`.
4. Justifying the grant in [`docs/SECURITY.md`](./docs/SECURITY.md).

If a permission is not in step 3, it is **not granted**, regardless of code.

## Build & bundle

- `npm run build` runs `tsc --noEmit` then `vite build` → `dist/`.
- `npm run tauri:build` calls the above (`beforeBuildCommand`) then compiles
  Rust in `--release` and produces native installers under
  `src-tauri/target/release/bundle/`.
- Release profile is tuned for size: `lto`, `codegen-units = 1`, `opt-level = "s"`.

## What this document is **not**

- Not a feature spec — see [`docs/product-specs/`](./docs/product-specs/).
- Not a visual reference — see [`docs/DESIGN.md`](./docs/DESIGN.md).
- Not a roadmap — see [`docs/PLANS.md`](./docs/PLANS.md) and
  [`docs/exec-plans/active/`](./docs/exec-plans/active/).
