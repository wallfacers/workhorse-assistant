# Tasks — add-agent-rail-chat

## 1. Mock data

- [x] Add `MOCK_MESSAGES` to `agent-rail.mock.ts`:
      a few alternating user/assistant entries (text only, no attachments needed)
      to seed the chat bubble flow

## 2. Rewrite `AgentRail.tsx`

- [x] Remove task-composer textarea, model/tools badges, search field, task list
- [x] Add chat bubble scroll area:
      - User bubble: right-aligned, `bg-pink-50 dark:bg-pink-950/40` (match MainChat)
      - Assistant bubble: left-aligned with avatar circle, white elevated card
        with border (match MainChat)
      - Copy / thumbs-up / thumbs-down action row below assistant bubble
- [x] Add toolbar strip above input (one row, horizontally laid out):
      - "任务列表" button (icon: `LayoutList` from lucide) → opens modal
      - Placeholder slots for future controls (attachment, slash-command, etc.)
- [x] Add input box at bottom:
      - `<textarea>` placeholder "请输入任务，交给我来完成"
      - Send button (`ArrowUp` icon, rounded-full)
      - Style matches `MainChat.tsx` input card (border, focus ring, shadow)
- [x] Retain dark-mode toggle in slim footer below input

## 3. New `TaskListModal.tsx`

- [x] Floating overlay (fixed backdrop + centered card)
- [x] Search input at top, auto-focused on open
- [x] Scrollable list of `MOCK_TASKS` entries, click-to-select closes modal
- [x] Keyboard: `Escape` closes; click outside backdrop also closes

## 4. Lint & verify

- [x] `npm run lint` passes (no new errors introduced)
- [ ] `npm run design:lint` passes (no hardcoded hex/rem)
- [ ] Manual: toolbar button opens/closes modal; Escape closes; bubble scroll
      works; dark-mode toggle works; right panel and terminal center unchanged
