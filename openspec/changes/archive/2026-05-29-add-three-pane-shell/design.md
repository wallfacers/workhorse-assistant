# Design — add-three-pane-shell

## Context

The app shell is three flex panes in `src/App.tsx`: `Sidebar` (left) ·
`TerminalWorkspace` (center) · `RightPanel` (right). The center is the real
S0–S2 multi-terminal workspace; the left and right are leftover AI-Studio mocks.
We are reshaping the **left and right** into the product's intended roles
(Agent rail / work panel) while leaving the center alone.

The user's constraint is explicit: **take the layout from the wireframe, but keep
the current project's visual style**. So this change copies *arrangement*, not
*aesthetics* — all styling stays on `docs/DESIGN.md` tokens and the existing
quiet Workhorse look.

Repository constraints (`AGENTS.md`): the renderer is sandboxed; privileged work
goes through Rust commands; visual values come from `DESIGN.md`, not hand-tuning.
This change touches none of the privileged surface — it is renderer-only,
mock-only.

```
TARGET SHELL (layout only — styling stays Workhorse)
┌──────────────┬─────────────────────┬───────────────────┐
│ AgentRail    │ TerminalWorkspace   │ Work panel        │
│ (left, mock) │ (center, UNCHANGED) │ (right, mock)     │
│              │                     │                   │
│ task composer│ TabBar              │ ── Task details ──│
│  + model/    │ ───────────────     │ access id / tags  │
│  tools       │ terminal grid /     │ created / branch  │
│ search       │ split panes         │ original prompt   │
│ task list    │ (agent CLI's own    │ ── Files ─────────│
│ ─────────    │  prompt lives       │ ▸ mock file tree  │
│ [dark toggle]│  INSIDE the PTY)    │ ── Preview ───────│
│              │                     │ (kept for later)  │
└──────────────┴─────────────────────┴───────────────────┘
```

## Decisions

### D1 — Layout shell first, mock content
This change ships the *arrangement* with placeholder content. No filesystem, no
network, no spawning from the left/right panes. Rationale: a visible, reviewable
milestone that de-risks the layout before any data plumbing; every later phase
(see Roadmap) slots real data into a shell that already looks right.

### D2 — Center pane is untouched
`TerminalWorkspace` keeps its slot and behavior verbatim. The wireframe's
bottom input bar is **the agent CLI's own TUI prompt rendered inside the PTY**
(e.g. Claude Code's input line), not a renderer component — so no prompt bar is
added here. This keeps the change off the privileged PTY path entirely.

### D3 — Left rail fully replaces `Sidebar`
`Sidebar.tsx` is deleted and replaced by `AgentRail.tsx`. The knowledge-base
tree, conversation list, brand header, and user-profile footer are dropped (the
user chose a full replacement, not a merge). The rail's regions:
- **Task composer:** a multi-line "new task" input + a model/tools selector
  (mock chips, e.g. a model label and a "tools active" indicator).
- **Search:** a single filter input (non-functional placeholder).
- **Task list:** mock task rows (one selected/active).

### D4 — Right panel = details + files + preview (stacked, scrollable)
`RightPanel` becomes three regions in a single scrollable column:
- **Task details:** mock metadata (access id, tags, created date, branch,
  original prompt).
- **Files:** a `FileTree` component rendering a **mock** collapsible tree
  (folders + files, lucide icons, expand/collapse). No real fs.
- **Preview:** the current document-preview content is retained as the bottom
  region. It becomes the future home for file-content / image / PDF / PPT /
  browser-style viewing (Roadmap R2–R3); for now it stays mock.
The existing collapse/expand affordance (`PanelRightClose` / `PanelRightOpen`)
is preserved.

**Density trigger (quantified).** The stacked-scroll arrangement is the default,
but it flips to a **tabbed** arrangement (details / files / preview as three tabs)
if it fails this concrete check during verification: *at a 1280 px window width
with the right panel open, the first row of all three regions is reachable
without scrolling past the Task-details region* — i.e. the Files and Preview
headings must be at least partially visible. If they are not, switch to tabs in
this change (don't defer). This removes the subjective "reads poorly" judgement.

### D5 — Dark-mode toggle relocation
The dark-mode toggle currently lives in the `Sidebar` footer. `TitleBar` is
**not** a candidate — it returns `null` outside Tauri, so the toggle would vanish
in `npm run dev` (browser iteration). Decision: keep the toggle inside
`AgentRail` (a minimal control in the rail footer or header), so it survives the
full `Sidebar` replacement and remains available in browser mode. `App.tsx`
continues to own `isDarkMode` state and pass the setter down.

Trade-off considered: a dedicated `App.tsx` shell-chrome strip (outside the three
panes) would be the most stable home, but the current shell has no such chrome
region and adding one is out of scope here. Accepted consequence: if `AgentRail`
later becomes collapsible, the toggle must be **lifted to a fixed `App.tsx`
position** at that time so it can't be hidden with the rail.

`isDarkMode` is passed only to drive the toggle's own icon (Sun/Moon) — a
functional need, matching the existing `Sidebar`. It is **not** used for styling
branches; all theming uses Tailwind `dark:` variants per `docs/FRONTEND.md`. (A
pure-CSS Sun/Moon swap is an acceptable alternative if we want to drop the prop.)

### D6 — Styling: arrangement copied, aesthetics kept
Only the *layout/structure* comes from the wireframe. Colors, radii, spacing,
typography stay on the existing Workhorse role tokens (the quiet system). Practically
that means reusing the same token utility classes the retained components use
(`bg-surface`, `text-on-canvas`, `border-outline`, `dark:*`) — see D8 for *which*
source those resolve from. No hardcoded hex/rem. Where a wireframe element has no
current analogue, derive it from an existing role token; greys without a role token
follow the neighbouring components' pattern (tech-debt #5).

### D7 — Right panel: stacked column, not tabs
The current `RightPanel` switches views with a **tabs capsule**
(工作日志 / 产出物 / 预览). R0 replaces that with a **single stacked, scrollable
column** (details → files → preview). Rationale: at R0 all three regions are short,
so showing them at once removes a click versus tab-switching, and it matches the
wireframe (which stacks Task-details above Files). This is a deliberate interaction
change, not an accident.
Acknowledged irony: the D4 density fallback would *re-introduce* tabs. That is an
explicit, **measured** escape hatch (only if the three regions cannot fit per the
1280 px check), not a default — we try the stack first and fall back only on a
concrete failure.

### D8 — Practical token source: DESIGN.md (nominal) vs `index.css` (runtime)
`docs/DESIGN.md` is the **nominal** source of truth (AGENTS.md rule 2), but at
runtime Tailwind resolves the hand-written `@theme` block in `src/index.css`, which
has **drifted** from DESIGN.md (e.g. `outline` `#C4CCD3`→`#e5e7eb`; `surface-dark`
`#101012`→`#161618`; `canvas-dark` / `surface-dark-elevated` / `outline-strong` are
CSS-only). `design:export:css` writes to `src/design-tokens.generated.css`, which is
**not imported**, so it does **not** regenerate `index.css`. Consequences for R0:
- New components use the **same role-token utility classes** the retained components
  use; these resolve via `index.css`, so new panes match `TabBar`/`PaneCard`
  automatically. This is what "keep the current Workhorse style" means in practice.
- To add a genuinely new **structural** token, edit `index.css` `@theme` (the runtime
  source) **and** mirror it in DESIGN.md — do **not** rely on `design:export:css`.
- We do **not** reconcile the global drift here (out of scope). It is logged as
  tech-debt for a separate token-audit change. We also **reject** "make `index.css`
  the source of truth": DESIGN.md stays the nominal source; the drift is a bug to fix
  later, not a new rule.

## Mock data contracts (R0)

To keep the mock shapes compatible with later real-data phases (R1/R4), R0 fixes
these minimal types (placed in `*.mock.ts`, see tasks):

```ts
type FileNode = { name: string; kind: 'folder' | 'file'; children?: FileNode[] };
type MockTask = { id: string; title: string; active?: boolean };
type TaskDetails = {
  accessId: string; tags: string[]; created: string;
  branch: string; originalPrompt: string;
};
```

## MVP Roadmap (the "complete MVP plan")

> Canonical product home: `docs/product-specs/agent-workspace.md` (the what/why
> of the workspace and these phases). This table is the implementation-facing
> mirror; keep the two in sync.

This change is **R0**. The shell makes the following phases independently
shippable — each is its own OpenSpec change, layered onto the shell:

| Phase | Change (proposed) | Delivers | New surface |
|-------|-------------------|----------|-------------|
| **R0** | `add-three-pane-shell` (this) | Layout shell, mock content, current styling | renderer only |
| **R1** | `add-file-tree-backing` | Right **Files** tree reads the active terminal's real working directory; lazy expand | Rust `fs_list_dir` command + IPC |
| **R2** | `add-file-preview` | Click a file → preview text/markdown/code content; basic image viewing in the Preview region | Rust `fs_read` (size-bounded) + IPC |
| **R3** | `add-artifact-viewer` | PDF / PPT / richer artifact viewing + browser-style operations in the Preview region | viewer libs / webview surface (TBD) |
| **R4** | `add-agent-task-flow` | Left task list wired to terminal groups — creating a task spawns an agent terminal group; Task-details metadata reflects the active session/branch | renderer + reuse of existing PTY commands |
| **R5** | `add-agent-controls` | Model/tools selector → launch profiles; search filters tasks; task persistence | renderer + profile/persistence work |

Ordering rationale: R1→R2→R3 build the right-pane "see your files & outputs"
story bottom-up; R4→R5 build the left-pane "drive agents" story. R1 and R4 are
independent and could parallelize after R0.

## Risks

- **Scope creep into MVP.** The shell is tempting to "just wire up." Guard: this
  change stays mock-only; any real data lands in R1+.
- **Losing the dark-mode toggle.** Mitigated by D5 (toggle stays in the rail, not
  the Tauri-only title bar).
- **Right pane density.** Three stacked regions in a narrow pane can feel
  cramped. Default is scroll; the **quantified density trigger in D4** (1280 px,
  all three region headings reachable) decides — in this change — whether to flip
  to tabs. Verified in `tasks.md`.
- **Wireframe aesthetic leakage.** Easy to accidentally copy the wireframe's
  dark-teal look. Guard: D6 + the `design:lint` / grep gates in tasks.
- **Token drift in retained code (honest declaration).** The retained components
  (`TabBar`, `PaneCard`, `TerminalWorkspace`, and the kept parts of `RightPanel`)
  carry many hand-written hex / Tailwind-grey values, and `index.css` itself has
  drifted from DESIGN.md (D8). New components built strictly on role tokens may read
  *slightly* differently from these neighbours. This is **not** this change's fault
  and **not** in R0 scope to fix — global visual reconciliation is a separate
  token-audit change. R0 mitigates by reusing the same classes the neighbours use
  (D6/D8), so the gap is minimal.
- **`design:lint` ≠ JSX token compliance.** `design:lint` validates DESIGN.md only;
  it does not scan `.tsx`, and `lint` is just `tsc`. So nothing automatically blocks
  a hardcoded hex in a component. Guard: the manual grep check in tasks (4.3).
- **Spec-promotion dependency on `PRODUCT_SENSE.md`.** The companion spec
  `docs/product-specs/agent-workspace.md` notes that `PRODUCT_SENSE.md`'s "one
  agent" framing diverges from the multi-agent reality. R0 (mock-only) ships
  regardless, but **R4** (agent task flow) likely cannot promote the spec to
  `active` until `PRODUCT_SENSE.md` is reconciled. Mitigation: a minimal
  `PRODUCT_SENSE.md` wording fix is paired with this change.
