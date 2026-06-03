## Context

`decouple-health-from-session` 的主体工作（Rust alive flag、reopenAgentSession、纯 health probe、SessionProvider bootstrap + reconnect）已在 HEAD 提交中完成。本 change 仅包含 3 项遗漏的收尾工作。

## Goals / Non-Goals

**Goals:**
- 4 个新 SSE 事件获得最小可用 UI（不再是 no-op 监听器）
- tooldone payload TS 类型与 Rust relay 对齐
- DESIGN.md 补充 3 个缺失 token 并纳入 `design:export:css` 导出管线

**Non-Goals:**
- 不构建完整的 subagent panel（仅系统消息条目）
- 不改变 `design:lint` 的校验范围（它只校验 DESIGN.md 内部一致性）
- 不将 `index.css` 的 `@theme` 块迁移为完全由生成文件驱动（那是独立的 token 管线重构）

## Decisions

### D1: SSE 事件最小 UI 策略（同前版）

| 事件 | UI 处理 |
|------|---------|
| `subagent_event` | 在消息列表中追加一条 system-message 样式的条目（subagent name + status） |
| `compaction` | 在 chat header 显示短暂 "上下文压缩完成" 指示器（3s 后消失） |
| `provider_retry` | 在 chat header 显示 "模型重试中…" 指示器，收到下一条 text/reasoning 时清除 |
| `interrupted` | 将当前 streaming assistant message 标记为 `interrupted`，停止 spinner，追加 "（已中断）" |

### D2: Token 补充走完整导出管线

**选择**:
1. 在 DESIGN.md `colors:` 块中声明 3 个 token
2. 在 DESIGN.md `components:` 块中为每个 token 添加引用条目（避免 orphaned 警告）
3. 运行 `npm run design:export:css` 生成 `src/design-tokens.generated.css`

**原因**: AGENTS.md rule 2 — DESIGN.md 是 visual token 的 source of truth，任何 token 变更必须通过 DESIGN.md → export 管线。

**注意**: `design:lint`（`@google/design.md lint`）仅校验 DESIGN.md 内部自洽性（token 声明与 component 引用是否匹配），不比对 CSS 文件。当前已 green（0 errors），本变更不会引入新错误。CSS 侧的 `@theme` 块中的手写值（与 DESIGN.md 一致）保持不变；将 `index.css` 迁移为消费生成产物是独立的管线重构，不在本 change 范围内。

### D3: tooldone 类型仅为类型声明补全

**选择**: 仅修改 `events.ts:100` 的 TypeScript 类型注解，不改变运行时行为。Rust 侧已经 emit 了 `ok`/`took_ms` 字段，JS 对象上实际已有这些属性。

## Risks / Trade-offs

- **SSE 事件 UI 过于简陋**: 4 个事件的 UI 是最小实现 → 用 data 属性标记便于后续重构
- **Token 管线的 generated CSS 未被 index.css 消费**: 当前 `@theme` 块手写值与 DESIGN.md 一致，generated CSS 是额外产物 → 后续管线重构时统一消费
- **design:lint 不能检测 CSS drift**: 这是 `@google/design.md` 工具的固有限制 → 可用 `diff <(design.md export ...) <(extract from index.css)` 做一次性验证，不在本 change 中建立持续校验
