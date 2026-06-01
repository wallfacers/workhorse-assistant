## 1. Tab Tools — Structured Output & Enriched Errors

- [x] 1.1 `focus_tab`: change handler to return `{ focused: true, index, label }` instead of `null`; update `outputSchema` to match with `description` on each property
- [x] 1.2 `focus_tab`: enrich `not_found` error to include current tab count and valid range (e.g. `"no tab at index 5; currently 3 tabs open (indices 0–2). Call get_open_tabs for the full list."`)
- [x] 1.3 `open_tab`: change handler to return `{ opened: true, index, label, profileId }` instead of `null`; update `outputSchema` with `description` on each property
- [x] 1.4 `open_tab`: enrich `validation` error to list valid profileId values with the received value echoed back

## 2. Fallback Tools — Structured Output & Enriched Errors

- [x] 2.1 `click_by_testid`: change handler to return `{ clicked: true, testId, tagName }` instead of `null`; update `outputSchema` with `description` on each property
- [x] 2.2 `click_by_testid`: enrich `not_found` error to list visible `data-testid` values (capped at 20)
- [x] 2.3 `click_by_testid`: enrich `forbidden` error to explain the `data-agent-clickable` opt-in requirement
- [x] 2.4 `read_by_testid`: add `description` fields to all `inputSchema` and `outputSchema` properties

## 3. Schema & Description Polish

- [x] 3.1 Add `description` field to every property in `get_open_tabs` and `get_button_state` schemas (both `inputSchema` and `outputSchema`)
- [x] 3.2 Rewrite `focus_tab` description using Markdown (inline code for `index` param, mention `get_open_tabs` dependency)
- [x] 3.3 Rewrite `click_by_testid` description using Markdown (inline code for `testId`, explain `data-agent-clickable` opt-in, add one-line example)
- [x] 3.4 Rewrite `open_tab` description using Markdown if the current plain text is sufficient, otherwise keep as-is

## 4. Verify

- [x] 4.1 Run `npm run lint` — type-check passes
- [ ] 4.2 Manual: invoke each action tool and confirm structured output (not `null`) — **requires running app**
- [ ] 4.3 Manual: trigger each error path and confirm enriched messages with context — **requires running app**
