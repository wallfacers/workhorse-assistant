## Why

AI 会话消息的操作按钮（复制、点赞、踩）当前只是纯装饰，没有任何交互功能。用户无法复制消息内容，也无法对助手回复进行质量反馈。这些反馈数据是后续持续优化智能体提示词和模型表现的重要输入，需要尽早建立数据通道。

## What Changes

- **复制按钮**：接入已有的 `writeClipboardText` 剪贴板 API，点击后复制消息纯文本内容，并显示 ✓ 确认图标 2 秒后恢复
- **点赞/踩按钮**：添加点击交互反馈（显示确认状态图标 → 几秒后恢复原样），多次点击同一按钮幂等（只记录一条反馈）
- **抽取 `MessageActionBar` 组件**：消除 `AgentRail.tsx` 和 `MainChat.tsx` 中重复的操作栏代码，统一维护
- **反馈占位通道**：后端先以 `console.log` 记录反馈数据结构 `{ messageId, type: 'like'|'dislike', timestamp, conversationId }`，为后续 Rust IPC 命令和远端对接预留接口

## Capabilities

### New Capabilities
- `message-action-bar`: 消息操作栏组件，包含复制、点赞、踩三个功能按钮，提供统一的 UI 反馈和事件回调接口

### Modified Capabilities
- `agent-chat`: 助手消息渲染新增操作栏交互（从纯装饰变为功能性按钮）

## Impact

- **前端组件**：新增 `MessageActionBar` 组件；修改 `AgentRail.tsx` 和 `MainChat.tsx` 使用新组件替换内联按钮
- **剪贴板**：复用已有 `src/ipc/clipboard.ts` 的 `writeClipboardText`
- **i18n**：复用已有 `agent.feedback.*` 翻译键，可能需要新增 `agent.feedback.copied` 等状态文本
- **后端**：暂无 Rust 侧改动，反馈数据先在前端 console.log 占位
