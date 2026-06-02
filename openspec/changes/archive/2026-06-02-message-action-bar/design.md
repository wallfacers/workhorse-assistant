## Context

左侧 AI 聊天面板的助手消息下方已渲染三个操作按钮（复制、点赞、踩），但全部没有 `onClick` 处理器，属于纯装饰状态。代码分别存在于 `AgentRail.tsx`（实际聊天）和 `MainChat.tsx`（静态设计参考），两处为重复的内联实现。

项目已有可用的剪贴板基础设施 `writeClipboardText`（`src/ipc/clipboard.ts`），以及代码块复制按钮的 ✓ 反馈模式（`MarkdownContent.tsx` 第 209–223 行）可直接复用。i18n 翻译键 `agent.feedback.*` 已定义。

## Goals / Non-Goals

**Goals:**

- 复制按钮：点击后将消息纯文本写入系统剪贴板，显示 ✓ 确认 2 秒后恢复
- 点赞/踩按钮：点击后显示确认状态图标，几秒后恢复；多次点击同一按钮幂等（只记录一条）
- 抽取 `MessageActionBar` 组件统一维护，消除 AgentRail 和 MainChat 的重复代码
- 反馈数据以结构化格式输出（当前阶段 console.log），预留 Rust IPC 命令接口

**Non-Goals:**

- 不在本期实现 Rust 后端的反馈持久化命令（后续迭代）
- 不实现踩之后的文本反馈输入框（后续迭代）
- 不修改代码块已有的复制行为
- 不新增 i18n 键（复用现有的 `agent.feedback.*`）

## Decisions

### D1: 抽取 `MessageActionBar` 组件

**选择**：创建 `src/components/chat/MessageActionBar.tsx`，接受 `content: string`、`messageId: string`、`conversationId?: string` props。

**替代方案**：继续内联在 AgentRail 中 → 放弃，因为两处重复且难以测试。

**理由**：组件化后 AgentRail 和 MainChat 各只需一行 `<MessageActionBar ... />`，反馈逻辑集中维护。

### D2: 复制功能复用 `writeClipboardText`

**选择**：直接 import `writeClipboardText` 从 `src/ipc/clipboard.ts`。

**理由**：该函数已处理 Tauri/非 Tauri 环境的降级，代码块复制按钮已验证其可靠性。无需重复造轮。

### D3: 确认反馈的 UI 模式

**选择**：使用 React state 切换图标，而非直接操作 `innerHTML`（代码块复制的 DOM 方式）。

**理由**：`MessageActionBar` 是 React 组件，用 state 驱动更符合 React 范式，可测试性更好。使用 `useState` + `useEffect` 定时恢复。

```
状态机：
idle → [点击] → confirmed → [2秒后] → idle

复制：idle(Copy icon) → confirmed(Check icon) → idle(Copy icon)
点赞：idle(ThumbsUp) → confirmed(Check icon) → idle(ThumbsUp)
踩：  idle(ThumbsDown) → confirmed(Check icon) → idle(ThumbsDown)
```

### D4: 反馈数据先前端 console.log

**选择**：定义 `submitFeedback(data)` 函数，当前实现为 `console.info('[feedback]', data)`，返回 Promise。数据结构为 `{ messageId, type: 'like' | 'dislike', timestamp, conversationId? }`。

**理由**：后续只需替换函数实现即可对接 Rust IPC 或远端 API，调用方无需任何改动。

### D5: 幂等反馈 — 防止重复记录

**选择**：在组件内用 `useRef<Set<string>>` 追踪已提交的反馈 key（`${messageId}:${type}`），重复点击直接返回。

**理由**：最简实现，无需外部状态管理。组件级 ref 即可满足需求。

## Risks / Trade-offs

- **[Risk] console.log 反馈数据丢失** → 可接受。本期目标是建立 UI 通道和数据结构，后续迭代添加持久化。迁移时只需替换 `submitFeedback` 实现。
- **[Risk] 复制纯文本 vs markdown** → 当前复制 `textContent`（纯文本），如果用户期望保留 markdown 格式后续可扩展 `content` prop 接受 raw markdown。但纯文本是更安全的默认值。
- **[Trade-off] 组件级幂等 vs 全局幂等** → 当前方案组件 unmount 后 ref 清空，理论上用户可以通过切换会话重新提交。但在当前阶段可接受，后续可在反馈函数中加入持久化去重。
