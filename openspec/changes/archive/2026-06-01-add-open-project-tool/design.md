# Design — add-open-project-tool

> Companion to [`proposal.md`](./proposal.md). The guiding constraint: **reuse
> the shipped project-switch UI, do not build a second folder picker.** The only
> new architecture is lifting "open the picker" into shared state so the agent
> can request it; everything else is wiring two tools onto existing functions.

## Where this sits in the existing system

```
┌──────────────────────────────── Renderer (TS) ─────────────────────────────────┐
│                                                                                │
│  Agent tool catalog (agent-frontend-tools)                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐     │
│  │ useAgentProjectTools (NEW, mirrors useAgentTabTools)                   │     │
│  │   · get_current_project (reader)  ── reads ──┐                         │     │
│  │   · open_project        (action)             │                         │     │
│  └───────────────┬──────────────────────────────┼─────────────────────────┘     │
│                  │ confirm:false                 │ confirm:true                  │
│                  ▼                               ▼                               │
│        ┌──────────────────┐          ┌──────────────────────────────┐           │
│        │ fsList(path) check│          │ session store (NEW slice)    │           │
│        │  ok → openProject │          │  pendingPickerRequest        │           │
│        │  miss → err+suggest│         │  { path, resolve, reject }   │           │
│        └────────┬─────────┘          └───────────────┬──────────────┘           │
│                 │                                     │ observed by              │
│                 │                                     ▼                          │
│                 │                     ┌──────────────────────────────┐           │
│                 │                     │ ProjectSwitcher (TitleBar)   │  EXISTING │
│                 │                     │  popover: known / enter /     │  +subscribe│
│                 │                     │  browsing(ProjectBrowser)     │           │
│                 │                     │  initialPath = request.path   │           │
│                 │                     └───────────────┬──────────────┘           │
│                 │                          onPick / cancel                       │
│                 ▼                                     ▼                          │
│        ┌──────────────────────────────────────────────────────────┐             │
│        │ useSession().openProject(path)  →  attachAgentSession      │  EXISTING  │
│        │                                  →  agent_attach (workdir) │            │
│        └──────────────────────────────────────────────────────────┘             │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Key decisions

### D1. `open_project` is an **action**, not a reader

Switching project re-attaches the session — a heavy, state-mutating effect. It
registers via `registerAction` (parallel-unsafe, serialized by the dispatcher),
not `registerState`. This is why the name matters: `explore_path` would read as a
read-only probe and tempt the model to call it speculatively. `open_project`
matches `open_tab`'s "this changes your working context" signal.

### D2. Two modes behind one tool, gated by `confirm`

```
open_project({ path })                 →  direct: fsList(path) → openProject | err
open_project({ path, confirm: true })  →  pendingPickerRequest → popover → user
```

Default direct-open keeps the common case frictionless (matches proposal scenario
"流畅，不打断"). The agent opts into confirmation when its candidate path is
uncertain — the structured-confirmation philosophy from `actionRegistry`.

### D3. Pre-validate the path with the **existing** `fsList`

Direct mode calls `fsList(path)` first. A resolvable directory → `openProject`.
A miss → a `not_found`/`validation` error envelope carrying the parent listing or
a suggestion, so the model self-repairs in one retry (per the LLM tool
conventions in CLAUDE.md). No new validation endpoint — `fsList` already returns
the listing or an error.

### D4. Lift only the *request to open the picker*, not the picker's state

`ProjectSwitcher` keeps its local `open` / `browsing` / `pathText` state. The
only thing promoted to the session store is a `pendingPickerRequest`:

```ts
// session store slice (NEW)
pendingPickerRequest: {
  path: string;                       // agent's candidate, pre-fills ProjectBrowser
  resolve: (picked: string) => void;  // user picked a path
  cancel: () => void;                 // user dismissed
} | null
```

The tool sets it and returns a Promise that resolves/rejects through these
callbacks. `ProjectSwitcher` observes it via a `useEffect`: when non-null, it
opens itself in `browsing` mode with `initialPath = request.path`; on `onPick`
it calls `request.resolve(picked)` then clears; on dismiss it calls
`request.cancel()` then clears. This keeps a single source of truth for the UI
and avoids a parallel modal.

### D5. Chat hint on confirm

When `confirm:true`, the popover opens in the `TitleBar` corner while the user's
attention is on the chat panel. The tool's confirmation flow emits a one-line
assistant-visible hint ("已为你打开项目选择器，请确认路径") so the user's eye is
drawn to the corner. This is a UX affordance, not a second UI.

### D6. `ProjectBrowser` gains an optional `initialPath` prop

Today `ProjectBrowser` always starts at `default_workdir` (empty `fsList()`).
Add an optional `initialPath?: string`; when present, the initial `load(initialPath)`
starts there. Manual open passes nothing → unchanged behavior. Agent confirm
passes the candidate path → the user lands on (or near) the agent's suggestion.

## Rejected alternatives

- **A new centered `FolderPickerModal`.** Rejected: duplicates `ProjectBrowser` +
  `ProjectSwitcher`, adds a second project-switch UI to keep in sync, and crowds
  the 400px panel with another modal. The popover is already the canonical
  switch UI.
- **A `useDirectoryListing` hook extracted from `ProjectBrowser`.** Deferred:
  `ProjectBrowser` inlines ~4 lines of `fsList` handling and is the only consumer
  besides the tool's direct-mode one-shot `fsList(path)` call. No real reuse to
  factor out yet; extract later if a third consumer appears.
- **`explore_path` naming.** Rejected per D1 (read/write semantics).
- **Default-to-confirm.** Rejected: too interruptive; inconsistent with
  `open_tab`/`focus_tab` which act immediately.
- **Tauri native folder dialog / Windows↔WSL path conversion.** Out of scope and
  wrong for a sidecar-namespace workdir (a remote/WSL sidecar's paths are not
  host paths) — the same reasoning already recorded on `ProjectBrowser`.

## Risks

- **Resolver lifetime.** A `pendingPickerRequest` holding `resolve`/`cancel`
  must not leak if the component unmounts mid-request. Mitigation: on
  `ProjectSwitcher` unmount (or a new request superseding an old one), call
  `cancel()` on the outstanding request so the tool's Promise always settles
  (the agent never hangs — mirrors the frontend-tool timeout guarantee).
- **Concurrent confirm requests.** Two `open_project({confirm:true})` in flight
  would race on the single `pendingPickerRequest`. Actions are parallel-unsafe
  and serialized by the dispatcher, so at most one is live; a second arriving
  while one is pending should reject with a clear "picker already open" error.
