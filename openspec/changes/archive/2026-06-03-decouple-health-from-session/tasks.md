## 1. tooldone payload 类型补全

- [x] 1.1 In `src/session/events.ts:100`, add `ok?: boolean` and `tookMs?: number` to the `agent://tooldone` payload type

## 2. SSE 事件 UI

- [x] 2.1 `subagent_event`: replace the no-op listener in `events.ts` with logic to append a compact system-message entry (subagent name + status: started/completed/error) with muted styling
- [x] 2.2 `compaction`: replace the no-op listener with logic to show "上下文已压缩" indicator in chat header, auto-dismiss after 3s, only for the active session
- [x] 2.3 `provider_retry`: replace the no-op listener with logic to show "模型重试中…" indicator in chat header, clear on next text/reasoning_start event, auto-dismiss after 30s
- [x] 2.4 `interrupted`: replace the no-op listener with logic to mark the current streaming assistant message with "（已中断）" suffix, stop spinner, persist across session switches
- [x] 2.5 Add i18n keys for new UI strings to `src/i18n/locales/zh-CN.json` and `src/i18n/locales/en-US.json`

## 3. DESIGN.md token 声明补全

- [x] 3.1 Add `outline-strong: "#D6D2C6"` to the `colors:` block in `docs/DESIGN.md`
- [x] 3.2 Add `canvas-dark: "#111110"` to the `colors:` block in `docs/DESIGN.md`
- [x] 3.3 Add `surface-dark-elevated: "#272420"` to the `colors:` block in `docs/DESIGN.md`
- [x] 3.4 Add corresponding entries in the `components:` block referencing each new token (so `design:lint` does not produce new orphaned warnings)
- [x] 3.5 Run `npm run design:export:css` and verify the generated `src/design-tokens.generated.css` contains the 3 new tokens

## 4. Verification

- [x] 4.1 `npm run lint` (tsc) green
- [x] 4.2 `npm run design:lint` green (0 errors, orphaned warnings not increased)
- [x] 4.3 Manual: verify 4 SSE events produce visible UI when triggered (requires desktop app with a running sidecar)
