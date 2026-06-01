# Proposal: `open_project` agent tool (agent can switch the project, user can confirm)

> **Status: DRAFTED.** Builds entirely on shipped surfaces: the `ProjectBrowser`
> folder browser and `ProjectSwitcher` popover in `TitleBar`, the
> `useSession().openProject` workdir-switch path, and the `agent-frontend-tools`
> action/reader registry. This change adds **one agent capability** — let the
> agent open a project (re-attach the session to a different workdir) — plus the
> minimal plumbing to optionally route that through the existing picker for user
> confirmation.

## Why

The agent today can open and focus terminal tabs (`open_tab` / `focus_tab` /
`get_open_tabs`) but cannot change **which project** it is working in. When the
user says "看看 `~/project/foo` 里的代码", the agent has no tool to act on it —
the only way to switch projects is the human clicking the `TitleBar` project
button and browsing.

Switching a project is not a read; it **re-attaches the session to a new
workdir** (`openProject` → `attachAgentSession` → `agent_attach`). That makes it
a state-mutating action that belongs in the action registry next to `open_tab`,
with the same "operation + structured confirmation" contract the other action
tools follow.

The folder-picking UI this would seem to need **already exists** and does not
need rebuilding:

- `ProjectBrowser.tsx` — navigates directories via `GET /v1/fs/list`, in the
  sidecar namespace (no native OS dialog, correct for a remote/WSL sidecar).
- `ProjectSwitcher` in `TitleBar.tsx` — a popover with three states (known-paths
  list / manual path entry / `ProjectBrowser`), already wired to `openProject`.
- `useSession()` — the single source of truth for `currentProject`,
  `recentProjects`, `projects`, and `openProject`.

So the real work is small and additive: **an `open_project` action**, a paired
**`get_current_project` reader** (read-before-write, like `get_open_tabs`), and
making the existing popover **programmatically openable & pre-fillable** so the
agent can request user confirmation without a second, parallel folder UI.

## What Changes

- **`open_project` action tool** (new): re-attach the session to a given
  `path`. Default behavior is direct (no popup): a valid path is opened via
  `openProject(path)` and returns `{ opened, path, label }`; a path that does not
  resolve returns a structured error with a suggestion (no popup). The schema
  also carries an optional `confirm` flag.

- **Confirm flow** (new): when the agent passes `confirm: true`, instead of
  switching immediately the tool **opens the existing `TitleBar` popover**
  pre-navigated to `path`, and resolves only after the user picks (returns the
  user's final path) or cancels (returns `{ opened: false, cancelled: true }`).
  No second modal is built — the user sees the same UI they use to switch
  projects by hand. The agent simultaneously surfaces a one-line chat hint
  ("已为你打开项目选择器，请确认路径") to draw the user's eye to the corner.

- **`get_current_project` reader** (new): returns
  `{ path, label, recentPaths }` so the agent can read state before switching
  and avoid re-opening the current project. Pairs with `open_project` exactly as
  `get_open_tabs` pairs with `open_tab`.

- **Programmatic picker invocation** (new plumbing): a shared
  *pending picker request* in the session store (set by the tool, observed by
  `ProjectSwitcher`) so the agent can open + pre-fill the popover. The popover's
  local open/browsing/path state stays local; only the *request to open* is
  lifted into the store. On pick/cancel the request resolves and clears.

## Capabilities

### New Capabilities

- `agent-project-navigation`: the agent can read the current project and switch
  the session to a different project workdir — directly when confident, or via
  the existing folder picker for user confirmation — reusing the shipped
  `ProjectBrowser` / `ProjectSwitcher` / `openProject` surfaces rather than a new
  dialog.

### Modified Capabilities

- `agent-frontend-tools`: no behavior change to the transport or registry; this
  change only adds two concrete tools (`open_project` action,
  `get_current_project` reader) to the catalog, following the existing
  action/reader contract (structured confirmations, self-repairing errors,
  parallel-unsafe actions).

## Impact

- **Renderer**:
  - New `useAgentProjectTools` hook (mirrors `useAgentTabTools`) registering
    `open_project` + `get_current_project`, reading live state through refs from
    `useSession`.
  - Session store gains a `pendingPickerRequest` slice (request + resolver) and
    actions to set/resolve it.
  - `ProjectSwitcher` subscribes to `pendingPickerRequest`: opens the popover in
    `browsing` mode pre-navigated to the requested path; on pick/cancel resolves
    the request.
  - `ProjectBrowser` gains an optional `initialPath` prop so the agent's
    candidate path is the starting directory (manual open keeps starting at
    `default_workdir`).
- **No Rust changes.** `GET /v1/fs/list` and `agent_attach` already exist;
  path validity is determined by the existing `fsList` call.
- **No sidecar (Go) changes.**
- **Backward compatibility**: purely additive. Manual project switching is
  unchanged; the picker starts at `default_workdir` exactly as today when opened
  by hand. New tools simply appear in the catalog.

## Open questions

- **Naming**: `open_project` (chosen, aligns with `open_tab` and signals a
  state-mutating re-attach) vs `explore_path` (rejected — reads as a read-only
  directory probe, inviting the model to misjudge it as side-effect-free).
- **Confirm default**: default is direct-open (no popup); `confirm` is opt-in
  for the agent when unsure. Alternative — default to confirm — was rejected as
  too interruptive and inconsistent with the other action tools.
- **Path validity without confirm**: should the tool pre-validate via `fsList`
  before attaching (so a bad path returns an error rather than attaching to a
  broken workdir), or attach optimistically and let attach fail? (Default:
  pre-validate with `fsList`, returning a suggestion on miss.)
- **Cancel semantics**: on user cancel the tool returns `{ opened:false,
  cancelled:true }` — confirm this is the contract the agent should see, vs a
  `validation`/`internal` error envelope. (Default: success envelope with
  `cancelled:true`, since cancel is a user choice, not a tool failure.)
