# Design — add-project-sessions

## Context

Today the chat is a single ephemeral session:

```
AgentRail.tsx  messages: useState<ChatMessage[]>   ← lost on unmount
      │ activeSessionId()
ipc/agent.ts   let active: ActiveSession | null     ← module singleton
      │ useAgentConnection: mount → attach ONE session
src-tauri/agent/mod.rs  sessions: HashMap<…>         ← already multi-capable
      │ POST /v1/sessions {provider, model, workdir} → {id}
workhorse-agent  create / GET stream / POST stream   ← no list/history/delete
```

Three facts shape this change:
1. The **backend is already multi-session** (per-session reader threads). The
   constraint is the renderer's `active` singleton + single-session UI.
2. The renderer has **no chat persistence**. Multi-session with rename/delete
   *requires* a persistence layer.
3. The sidecar protocol **cannot list or replay** a session today.

## Decisions

### D1 — Source of truth for history = the sidecar
The sidecar persists each session's transcript to its **data directory**, keyed
by project path, borrowing the Claude-Code layout
(`<dataDir>/projects/<encoded-path>/<sessionId>.jsonl`). The assistant never
reads/writes that directory; it consumes new HTTP endpoints. This honors the
`AGENTS.md` boundary (filesystem belongs to the backend) and — critically — keeps
persistence **namespace-clean** when the sidecar later runs in WSL (see D6).

### D2 — Multi-live sessions; listeners live in the store
Sessions run in the background simultaneously (N concurrent SSE streams), per the
user scenario: A streaming → switch to B (B streaming) → switch back to A (A
still streaming). To make this real:

- Chat state (`messages`, `streamingIds`, and the `assistantIdRef`/`deltaRef`
  delta buffers — currently single refs in `AgentRail`) moves into an **App-level
  store keyed by `sessionId`**.
- The store keeps SSE listeners **mounted for the set `active ∪ running`** — not
  just the visible session. A non-visible running session keeps accumulating into
  its buffer.
- **Subscribe rule**: attach a live stream to a session when it is the active one
  OR has `status === 'running'`. Sending a message marks a session running →
  ensure a stream.
- **Eviction policy** (memory): a session that is idle AND not active drops its
  in-memory buffer and closes its stream; revisiting it reloads from
  `GET …/history`. This bounds memory at roughly `|active ∪ running|` buffers.
  *(If shipped without eviction, that is tech debt — see tracker.)*

### D3 — `active` singleton → `Map<sessionId, ActiveSession>`
Every `ipc/agent.ts` fn (`sendAgentMessage`, `cancelAgentMessage`,
`sendPermissionDecision`, `forwardResult`, `publishCatalog`) takes an explicit
`sessionId`. `setCatalogPublisher` becomes **per-session**, and
`republishCatalog()` fans out to all attached sessions. The Rust `attach` is split
into **create** (`POST /v1/sessions`) vs **open** (`agent_open_session` — spawn an
SSE reader for an existing id, no create) so switching to an old session never
duplicates it upstream.

### D4 — Project = a local path (opaque, sidecar-namespace string)
A project is the sidecar's `workdir`. The renderer/bridge treat it as an **opaque
string in the sidecar's filesystem namespace** — never parsed/normalized with
host path logic (see D6). The TitleBar (left, currently empty drag region) hosts
the project switcher: a `▾` dropdown listing recent paths + "open folder…".

**First-cut scope boundary**: the project scopes **only the agent session list**
(which `workdir` new sessions use + which sessions are listed). The embedded
terminal is **not** re-scoped by project in this change (tech debt; WSL makes this
coupling more desirable — deferred to `add-wsl-remote`).

### D5 — UI: 方案① session switcher + `⋯` menu, mirroring `ProfileMenu`
Two altitudes, each at its natural scope:

```
TitleBar:   [◐ project ▾]  …drag…  [─][□][×]      ← project (window-level)
AgentRail:  [session title ▾]            [⋯]      ← session (panel-level)
            click title → dropdown:               click ⋯ → menu:
              · session A ✓                          · rename → PATCH
              · session B (running)                  · delete → DELETE
              · + new session
```

Both dropdowns reuse the terminal `ProfileMenu.tsx` pattern: `useRef` +
`mousedown`-outside-to-close + `absolute z-50` panel. Project switching has a
**single home** (TitleBar); the session dropdown may show a read-only project
breadcrumb but no second project control.

### D6 — Remote/WSL forward-compatibility (cheap insurance, decided now)
A later change runs the sidecar in WSL (UI on Windows, sidecar in WSL2,
project = a WSL path — VS Code Remote-WSL style). The agent transport is already
remote-ready (loopback HTTP + `WORKHORSE_AGENT_ENDPOINT` + WSL2 localhost
forwarding). To avoid rework, this change commits to:

1. **`workdir`/project path is an opaque sidecar-namespace string.** No host path
   parsing/normalization in renderer or bridge.
2. **No "default to host cwd" for `workdir`.** The bridge currently falls back to
   `std::env::current_dir()` (a Windows path) when `workdir` is empty — wrong when
   the sidecar is in WSL. Replace with **explicit project selection**; do not
   default to host cwd.
3. **Agent endpoint configurable in Settings UI** (not env-only), so users can
   point at a WSL sidecar without pre-launch env vars.
4. **Display paths verbatim** (the sidecar namespace) — no backslash prettifying.
5. **Reserve a `wsl` terminal profile** concept slot in `profiles.ts` (no
   implementation here).

These are no-cost to honor now; skipping them guarantees rework in
`add-wsl-remote`.

## Risks

- **State extraction from `AgentRail` → multi-session store** is the highest-risk
  piece: listener lifecycle, N-buffer memory growth, races when switching
  mid-stream, and the single `assistantIdRef`/`deltaRef` becoming per-session.
- **`active` singleton → Map** ripples through every IPC fn and the catalog
  publisher fan-out.
- **Sidecar dependency**: rename/delete/list/history/status are blocked on the Go
  side (`workhorse-agent-tasks.md`). The assistant can land the store + UI against
  a stub, but end-to-end needs the endpoints.

## Open questions

- Does a project with zero sessions still appear in the switcher (needs a
  recent-paths memory on the assistant side, or `GET /v1/projects` returning
  registered-but-empty paths)?
- Auto-title: does the sidecar derive a session title from the first message, or
  does the assistant send a default + let the user rename?
- On app restart, do we auto-resubscribe to `running` sessions, or only on first
  view?
