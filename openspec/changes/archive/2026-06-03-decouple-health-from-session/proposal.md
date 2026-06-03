## Why

`decouple-health-from-session` 的核心工作（Rust alive flag、reopenAgentSession bridge、useAgentConnection 纯 health probe、SessionProvider bootstrap + reconnect、UI 移除 sessionId）已在 HEAD 上完成。但仍有 3 项遗漏：

1. Rust bridge 已 relay 但 TS 侧仍为 no-op 的 4 个 SSE 事件（subagent_event、compaction、provider_retry、interrupted）没有 UI 展示
2. `events.ts` 中 `agent://tooldone` 的 payload 类型落后于 Rust relay（缺少 `ok?`/`tookMs?`）
3. `docs/DESIGN.md` 的 `colors:` 块缺少 `outline-strong`、`canvas-dark`、`surface-dark-elevated` 三个 token 的声明（CSS 中已在使用），且未纳入 `design:export:css` 生成管线

## What Changes

- **SSE 事件 UI**：为 subagent_event（系统消息条目）、compaction（chat header 临时指示器）、provider_retry（chat header 重试指示器）、interrupted（消息中断标记）增加最小可用 UI
- **tooldone 类型补全**：`events.ts` payload 类型增加 `ok?: boolean` 和 `tookMs?: number`
- **DESIGN.md token 补全**：在 `colors:` 和 `components:` 块中补充 3 个 token 声明，运行 `npm run design:export:css` 生成 CSS，使 DESIGN.md 按 AGENTS.md rule 2 成为真正的 source of truth

## Capabilities

### New Capabilities

- `sse-event-display`: 四个 SSE 事件（subagent_event, compaction, provider_retry, interrupted）的 UI 展示

### Modified Capabilities

- `visual-theme`: DESIGN.md 补充 `outline-strong`、`canvas-dark`、`surface-dark-elevated` 三个 token 并纳入导出管线

## Impact

- **SSE 事件**: `src/session/events.ts` — 替换 4 个 no-op 监听器；`src/components/chat/` — 新增事件 UI 组件
- **类型**: `src/session/events.ts:100` — tooldone payload 类型
- **Design tokens**: `docs/DESIGN.md` — `colors:` + `components:` 块；`src/design-tokens.generated.css` — `npm run design:export:css` 生成/更新
- **i18n**: `zh-CN.json`、`en-US.json` — SSE 事件相关新 key
