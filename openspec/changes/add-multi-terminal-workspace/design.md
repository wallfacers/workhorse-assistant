# Design — add-multi-terminal-workspace (S1)

## Context

S0 proved a single PTY terminal round-trips inside the WebView. S1 lets several
run at once and be arranged, which is the product's core ("see multiple agents
work"). The hard part is **not** spawning — that is solved — it is the
renderer-side layout/state and keeping background agents alive while hidden.

S0 already chose per-session event topics (`pty://output/{id}`,
`pty://exit/{id}`) so each `Terminal` subscribes only to its own session. That
makes N terminals a pure composition problem: mount N `Terminal`s, each owns its
PTY. S1 adds no Rust and no IPC.

```
TerminalWorkspace (center pane)
├── TabBar:  [Group A*] [Group B]  [ +▾ profile ]
└── active Group "A"
     └── pane grid: ┌ pane ┐ ┌ pane ┐     (split = add a pane)
                    │<Term>│ │<Term>│
                    └──────┘ └──────┘
  inactive Group "B": still mounted, display:none, PTYs alive
```

## Decisions

### D1 — Renderer-only state tree via `useReducer`
State lives in `TerminalWorkspace`:

```
Workspace { groups: Group[]; activeGroupId: string }
Group     { id; label; panes: Pane[]; activePaneId: string }
Pane      { id; profileId: ProfileId }
```

A `useReducer` handles: `addGroup(profileId)`, `closeGroup(id)`,
`activateGroup(id)`, `addPane(groupId, profileId)` (= split), `closePane(groupId,
paneId)`, `activatePane(groupId, paneId)`. Ids are generated client-side
(`crypto.randomUUID()` or a counter) and used only as React keys / lookup keys —
they are **not** PTY session ids (those stay owned by each `Terminal`). No state
library; React is enough for this tree.

**Reducer invariants (must hold after every action — there is no "dangling
active id"):**
- `closePane` removing the group's `activePaneId` SHALL reassign `activePaneId`
  to the **first remaining pane**; removing the last pane SHALL `closeGroup` that
  group.
- `closeGroup` removing the `activeGroupId` SHALL reassign `activeGroupId` to the
  **right neighbour, or the left neighbour if none** (tab order); removing the
  last group SHALL leave `activeGroupId` empty and surface the empty state (D6).
- `Group.label` is fixed at `addGroup` time from the **creation profile** and
  never changes when panes are added/removed (B); the tab shows that label plus a
  pane-count badge when the group has more than one pane.

Rejected — a global store (zustand/redux): unnecessary for one subtree; adds a
dependency the project does not yet have.

### D2 — The S0 `Terminal` is the leaf, keyed by pane id
Each pane renders `<Terminal key={pane.id} profileId={pane.profileId} />`. The
React `key` = pane id guarantees React mounts/unmounts the **right** xterm+PTY as
panes are added/removed, never reusing one pane's xterm for another's session.
Closing a pane removes it from state → React unmounts that `Terminal` → S0's
cleanup (`detach listeners → pty_kill → dispose`) fires. S1 inherits PTY
lifecycle for free; it never calls `pty_*` directly.

### D3 — Inactive groups stay mounted and hidden (agents keep running)
Switching tabs must **not** kill background agents — an agent reviewing code
should keep working while you watch another. So inactive groups are not
unmounted; they are hidden by toggling Tailwind's **`hidden` class**
(`display:none`) on the group container — used consistently, not the HTML
`hidden` attribute, to avoid any `[hidden]` CSS-override ambiguity. Their
`Terminal`s stay mounted, their PTYs alive, output buffered in xterm's
scrollback. Only mount/unmount (create/close), never tab-switch, ends a session.

Rejected — unmount inactive tabs: simplest React-wise but kills the agent on
every tab switch, defeating the product's purpose.

### D4 — Zero-size guard + refit-on-show (depends on a small S0 tweak)
`display:none` collapses a container to 0×0. The S0 `Terminal`'s `ResizeObserver`
would then `fit()` to 0 cols/rows and call `pty_resize(0, …)`, which the core
rejects (`cols 1..=…`) — harmless but wrong, and it corrupts xterm geometry.
Worse, `fit.fit()` on a 0×0 element can itself throw or set cols/rows to 0
depending on the xterm version. Fix in S0 `Terminal`:

- **Guard *before* `fit.fit()`, not after.** The very first line of the
  `ResizeObserver` callback returns early when the container is zero-size:
  `if (container.clientWidth === 0 || container.clientHeight === 0) return;`. Only
  past that guard do `fit.fit()` and `pty_resize` run.
- **Guard the initial `fit()` + spawn too** (defensive, per review H). At mount,
  if the container is zero-size, skip the initial `fit()` and spawn with **no**
  `cols`/`rows` so the core uses its 80×24 default — never `pty_spawn(…, 0, 0)`.
  In S1 a new pane always mounts inside the visible group (non-zero), so this is
  a defensive invariant, not the normal path; it keeps `Terminal` correct if a
  future feature (e.g. background pane creation) mounts it hidden.

When a hidden group is shown again, the container regains size, the
`ResizeObserver` fires (the `display` toggle changes the content box), the guard
passes, and the terminal refits to the correct geometry. This is the only change
S1 makes to S0 code; it has no effect on the single-terminal S0 behaviour (its
container is never zero-size).

### D5 — Grid layout, split trigger, no drag
A group's panes tile in an equal-cell CSS grid sized by a general rule for any
N: **`cols = Math.ceil(Math.sqrt(n))`, `rows = Math.ceil(n / cols)`** (1→1×1,
2→1×2, 3–4→2×2, 5–6→3×2, …). No drag handles, no stored ratios — deferred.

**Split / close trigger location (D):** each pane carries a small chrome (a thin
top bar or a hover overlay in the top-right) with a `+` **split** button and a
`×` **close** button. `+` opens the same `ProfileMenu` (D6) and dispatches
`addPane(groupId, profileId)`; `×` dispatches `closePane`. There is no separate
group-level split toolbar — split is always relative to a pane, which also reads
naturally ("split this one").

Focus is tracked (`activePaneId`) to show a subtle active-pane outline (existing
tokens) and to target keyboard input; clicking a pane sets `activePaneId` and the
DOM focus together. xterm routes keystrokes to whichever terminal is DOM-focused;
we don't force focus programmatically beyond the click.

**Spawn failure inside a split (review note):** if a newly split pane's
`pty_spawn` fails, the pane **stays** in state and shows the S0 inline error in
its xterm (parity with S0 — not a blank cell). It is not auto-removed; the user
closes it with `×`. Auto-remove-on-failure is deferred.

### D6 — Profile picker, initial state, empty state
- **Picker → `ProfileId`, never a label (G):** a single source of truth
  `PROFILE_LABELS: Record<ProfileId, string>` maps the canonical id to its
  display label — `{ shell: "shell", "claude-opus": "claude+opus", "claude-glm":
  "claude+GLM", codex: "codex" }`. `ProfileMenu` renders the labels but its
  `onSelect` returns the **`ProfileId`** (e.g. `"claude-glm"`, hyphen — never the
  `"claude+GLM"` display string), which is exactly what `pty_spawn` and the
  reducer consume. This prevents the `+`-vs-`-` mismatch that would make the core
  profile map miss.
- **Picker trigger sites:** the `+▾` in the tab bar (→ `addGroup`) and each
  pane's `+` (→ `addPane`, D5) both open this one `ProfileMenu`.
- **Tab label (B):** the tab shows `Group.label` (fixed at creation from the
  creation profile's display label) and, when the group holds more than one pane,
  a count badge, e.g. `claude+opus · 2`.
- **Initial:** the app starts with one group containing one `shell` pane (parity
  with S0's default mount).
- **Empty:** closing a group's last pane closes the group; closing the last
  group shows an empty state with a "新建终端" prompt — never a blank void.

### D7 — Styling reuses existing design tokens
Tabs, the picker, and pane chrome use existing `docs/DESIGN.md` tokens
(`surface-*`, `outline*`, `primary`, `on-canvas*`) and Tailwind utilities — **no
hand-tuned hex/spacing** (per `CLAUDE.md`). If a genuinely new token is needed
(e.g. an active-tab accent not already expressible), it is added to `DESIGN.md`
first and re-exported, not inlined.

### D8 — No new Rust, no new IPC, no new capability
S1 is pure composition over S0. It registers no command, adds no permission, and
keeps the security boundary identical: spawning stays core-only; the renderer
still passes only a `profile_id`. Per-session topics (S0 D2) mean each leaf
`Terminal` self-routes; the workspace never touches raw PTY I/O.

## Risks

- **Hidden-terminal sizing:** the D4 guard is load-bearing; without it hidden
  panes spam rejected `pty_resize(0,…)` and show wrong geometry on return.
  Covered by a verification step (open two tabs, switch, confirm clean refit).
- **Many concurrent PTYs:** each agent is a real process; a user opening a dozen
  is genuinely a dozen children. Acceptable for S1 (no artificial cap); revisit
  if it bites. The S0 app-exit `kill_all` already reaps them all.
- **Focus vs. DOM focus:** `activePaneId` (visual) must not fight xterm's own DOM
  focus. Decision: clicking a pane sets both; we don't force focus
  programmatically beyond the click.

Accepted low-severity items (recorded, not fixed in S1):
- **Refit lag on tab switch (I):** the `ResizeObserver` refit is debounced ~80 ms,
  so a just-shown group renders at its old geometry for up to ~80 ms (brief
  visual jump). Acceptable; if it annoys, the mitigation is an **immediate
  (non-debounced) fit on first resize after show** — a small follow-up, not
  required for S1.
- **StrictMode double-mount waste (J):** in dev, React mounts→unmounts→mounts each
  pane, so the first PTY is spawned then immediately killed by the `disposed`
  guard. Harmless (the guard reaps it) but wasteful with many panes; dev-only,
  gone in production builds. Not fixed.
- **Silent resize errors (K):** `void ptyResize(...)` drops its `Result`; with many
  concurrent panes the resize/exit race widens (a session may exit mid-resize).
  Not user-visible (a stale session's rejected resize is a no-op); a dev-mode log
  could aid debugging later. Not fixed.
