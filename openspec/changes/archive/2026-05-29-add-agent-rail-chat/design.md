# Design — add-agent-rail-chat

## Context

The left `AgentRail` (shipped in R0) is a task-management surface: a textarea
composer, model/tools badge chips, a search field, and a task list. This front-
loads task management, but the dominant user interaction is **conversation** —
the user types a message, reads the agent's reply, continues the thread. Task
management is secondary; they want it available but not always in the way.

A wireframe (2026-05-29) confirms the intended shape: the left pane is a
**conversation panel** — scrollable chat bubbles, an input box at the bottom, and
a toolbar that provides access to task-management via an on-demand modal. This
change delivers that panel with mock/placeholder content; real wiring (persistent
messages, real task spawning) is deferred to R4–R5.

`MainChat.tsx` already implements user/assistant bubble rendering in the correct
Workhorse visual language. It is currently an orphan (not imported). This change
treats it as the **implementation blueprint** for the bubble/input markup.

```
CURRENT AgentRail                    TARGET — left pane conversation panel
─────────────────────                ──────────────────────────────────────
┌────────────────────┐               ┌────────────────────┐
│ [描述新任务…     ]  │               │  chat bubble area  │ ← flex-1 scroll
│  Claude Sonnet  ▷  │               │                    │
│  工具已启用         │  ─→           │ ╭──────────────╮   │
│ [🔍 搜索任务…]      │               │ │ user bubble  │   │ (right-aligned)
│  任务列表           │               │ ╰──────────────╯   │
│  · task A ●        │               │ ╭──────────────╮   │
│  · task B          │               │ │[M] AI bubble │   │ (left, avatar)
│ ─────────── [🌙]   │               │ │  copy 👍 👎   │   │
└────────────────────┘               │ ╰──────────────╯   │
                                     │ ──────────────────  │
                                     │ [🗂️][📎][/][…]      │ ← toolbar strip
                                     │ ┌──────────────┐   │
                                     │ │请输入任务…    │   │ ← textarea
                                     │ │              │   │
                                     │ │ [📎]…   [↑] │   │
                                     │ └──────────────┘   │
                                     │ ─────── [🌙]        │ ← footer
                                     └────────────────────┘
```

## Decisions

### D1 — AgentRail is rewritten, not extended

The task-composer textarea, model/tools badges, search field, and task list are
all removed from the rail's permanent layout. They are replaced by the
conversation panel structure. Rationale: the two layouts don't compose gracefully
(task list consuming ~40% of pane height, permanently visible, is the exact
problem being solved). A clean rewrite is simpler than a conditional toggle.

The file is still named `AgentRail.tsx` — "agent rail" remains the conceptual
name for the left pane even though its surface is now conversational.

### D2 — Bubble markup copied from MainChat.tsx

`MainChat.tsx` has the correct Workhorse bubble styles (pink-50 user bubble /
white elevated AI card with border and shadow) already verified and lint-passing.
The implementation copies this markup directly rather than abstracting a shared
component. Rationale: premature abstraction — the rail bubbles and a potential
future full-screen chat share the same visual intent but may diverge (e.g. the
rail has no max-width constraint; a full-page chat would). Copy first, extract
later if the duplication proves costly (R4 is the natural review point).

`MainChat.tsx` itself: retained in the file tree as a **design reference** for
now. It is not deleted in this change. If R4 reintroduces a full-page chat mode,
it will be the starting point; if not, deletion is the right call then.

### D3 — Toolbar strip above the input box

A single horizontal row between the bubble area and the input box carries
secondary controls:

| Slot | Icon | Action |
|------|------|--------|
| 任务列表 | `LayoutList` (lucide) | Opens `TaskListModal` |
| (reserved) | — | Placeholder for future: attachment, slash-command, model selector |

The toolbar is visually quiet — icon buttons with hover states, no background
card. It does not compete with the input box below it.

### D4 — Task list as a modal overlay, not a permanent sidebar region

The task list moves out of the permanent layout into a `TaskListModal` — a
floating overlay triggered by the toolbar button. Rationale:

- The list is only needed when the user wants to switch tasks (infrequent). It
  should not consume vertical space on every interaction.
- A modal is simpler to implement than an anchored popover and avoids z-index
  complexity with the terminal pane.
- At R4 the modal will be wired to real task data; its internal structure (search
  + list) is stable enough to defer the wiring without redesign.

Modal behaviour: fixed dark backdrop (`bg-black/40`), centered card, search input
at top, scrollable task list, click-to-select closes it, Escape also closes.
No animation in this change (consistent with D7 in `add-right-panel-tabs`).

### D5 — Input box matches MainChat.tsx input style

Same `bg-white dark:bg-surface-dark-elevated border border-outline rounded-xl
shadow focus-within:ring` wrapper, same `textarea` placeholder, same
`ArrowUp`-icon send button. The sizing difference: in `MainChat` the input box
can be wider (centered in a broad center pane); in the rail it is full-width of
the 264 px rail.

The `选择文件` pill-button from `MainChat` is replaced by the toolbar strip
(D3). File/attachment controls belong in the toolbar row so the input box stays
uncluttered.

### D6 — Mock messages in agent-rail.mock.ts

A `MOCK_MESSAGES` array drives the bubble flow:

```ts
type Message = {
  role: 'user' | 'assistant';
  content: string;
  // future: attachments, timestamp, status
};
```

Two to three alternating entries are enough to demonstrate the bubble layout and
scrolling. The array lives in `agent-rail.mock.ts` alongside the existing
`MOCK_TASKS` (task list modal still uses it).

### D7 — Dark-mode toggle stays in a slim footer below the input

Preserving the toggle location from D5 of `add-three-pane-shell`: stays inside
`AgentRail`, not moved to `TitleBar` (Tauri-only) or any other surface. It moves
from the rail's old footer (below the task list) to a slim footer row below the
input box, right-aligned.

### D8 — pane width unchanged: 264 px (w-64)

The rail keeps its R0 width. The conversation panel is narrow, but:
- User bubbles are right-aligned with `max-w-[80%]` as in `MainChat`.
- AI bubbles are left-aligned with `flex-1`, no max-width constraint (the rail is
  the width constraint).
- The input box is full-width of the pane.

At 264 px the layout reads correctly. A future resize-drag affordance (if added)
would let the user widen the rail; that is deferred.

## Mock data contracts

```ts
// agent-rail.mock.ts additions
type Message = { role: 'user' | 'assistant'; content: string };
export const MOCK_MESSAGES: Message[] = [
  { role: 'user',      content: '…placeholder user message…' },
  { role: 'assistant', content: '…placeholder assistant reply…' },
  { role: 'user',      content: '…second user message…' },
];

// TaskListModal continues to use MOCK_TASKS (existing type, unchanged)
```

## Risks

- **264 px is narrow for bubbles.** At this width a long user bubble wraps
  aggressively. Mitigated by `max-w-[80%]` and `leading-relaxed`; verify with a
  realistic message length in testing (task 4.1).
- **Modal layering with terminal pane.** The modal uses `fixed` positioning over
  the full window. The terminal pane's xterm canvas can bleed through if z-index
  is not high enough. Guard: use `z-50` on the modal backdrop (standard for the
  codebase's overlay convention); verify in Tauri dev mode (task 4.2).
- **MainChat.tsx orphan confusion.** Leaving `MainChat.tsx` in the tree without
  import could confuse future contributors. Mitigated by a one-line comment in
  the file header (added in this change) marking it as a design reference pending
  R4 evaluation.
- **Toolbar strip future over-engineering.** Placeholder slots could tempt early
  wiring of attachment or slash-command features. Guard: proposal explicitly marks
  them as reserved; tasks include only the 任务列表 button.

## Roadmap connection

This change corresponds to the **left-pane conversation shell** needed before R4
(`add-agent-task-flow`) can wire real task data. R4 will replace `MOCK_MESSAGES`
and `MOCK_TASKS` with live agent session data — the component structure is
designed to make that substitution straightforward (a data-source swap, not a
layout refactor).
