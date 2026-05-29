## Why

The current `AgentRail` (left pane) is a task-management surface: a textarea for
describing a new task, a model/tools badge row, a search field, and a task list.
This design front-loads task management, but the primary user interaction is
**conversing with an agent** — typing a message, reading a response, continuing
the thread. Task management is secondary: the user occasionally wants to browse
past tasks or switch between them, but not on every interaction.

The intended left-pane shape is a **conversation panel**:

- A scrollable chat bubble flow occupies most of the pane's height.
- A multi-line AI input box sits at the bottom, matching the existing
  `MainChat.tsx` input style.
- A toolbar strip above the input box carries secondary controls; one of its
  buttons opens a **task-list modal** (a floating overlay with search + task list)
  so the user can switch tasks without the list consuming permanent vertical space.
- The dark-mode toggle is retained in the pane's footer.

`MainChat.tsx` already implements user/assistant bubble rendering, attachment
cards, copy/thumbs feedback buttons, and the input box. It is currently an orphan
(not imported by `App.tsx`). This change brings it into the left pane by
restructuring `AgentRail.tsx` to host the conversation UI, and introduces a
`TaskListModal` for on-demand task browsing.

## What Changes

- **`AgentRail.tsx`:** rewritten to host:
  1. A chat bubble scroll area (using the bubble + input markup from
     `MainChat.tsx` as the implementation reference).
  2. A bottom input box (`textarea` + send button) styled to match `MainChat`.
  3. A toolbar strip above the input with a "任务列表" icon-button that toggles
     the `TaskListModal`.
  4. Dark-mode toggle retained in a slim footer below the input box.
  The existing `taskInput` / `searchQuery` state is removed; a new `chatMessages`
  mock array drives the bubble flow.

- **`MainChat.tsx`:** remains in the tree but is no longer referenced by
  `App.tsx`. Its bubble/input markup becomes the implementation blueprint for the
  rewritten rail. It may be deleted or retained as a design reference — decided
  at implementation time.

- **New `TaskListModal.tsx`:** a lightweight modal/popover containing a search
  field and a scrollable task list (same mock data as the old `MOCK_TASKS`).
  Selecting a task closes the modal. No persistence or process spawning.

- **`agent-rail.mock.ts`:** retains `MOCK_TASKS`; adds a `MOCK_MESSAGES` array
  (a few user + assistant bubble entries) to drive the chat scroll area.

- **Styling:** no new palette values; bubbles follow `MainChat.tsx`'s existing
  token usage (pink-50 user / white elevated assistant in light; dark variants).
  `npm run design:lint` stays green.

## Capabilities

### New Capabilities

- `agent-rail-chat`: the conversation-panel left pane — chat bubble flow, bottom
  input box, toolbar with task-list modal trigger, dark-mode toggle. Content is
  mock; no process spawning, persistence, or network access in this change.

### Modified Capabilities

- `three-pane-shell`: the left-pane requirement is updated — the rail now hosts
  a conversation panel rather than a task composer + list. The center and right
  panes are unchanged.

## Impact

- **Code (Renderer):** `AgentRail.tsx` rewritten; new `TaskListModal.tsx`;
  `agent-rail.mock.ts` extended with `MOCK_MESSAGES`. `App.tsx` unchanged
  (slot wiring stays the same). `MainChat.tsx` disposition decided at
  implementation time (delete or retain).
- **Code (Rust):** none.
- **IPC / capabilities:** none.
- **Dependencies:** none (lucide-react icons already available).
- **Persistence:** none.
- **Security:** unchanged — the pane reads no files, spawns no processes.
- **Out of scope:** real message persistence, real agent conversation wiring,
  task-to-conversation linking, search within chat history (deferred to R4–R5
  per `docs/product-specs/agent-workspace.md`).
