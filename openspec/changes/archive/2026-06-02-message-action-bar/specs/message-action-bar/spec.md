## ADDED Requirements

### Requirement: Message action bar component

系统 SHALL 提供一个 `MessageActionBar` React 组件，在每条助手消息渲染完成后显示，包含复制、点赞、踩三个功能按钮。组件 SHALL 接受 `content`、`messageId`、`conversationId?` props。

#### Scenario: Action bar appears after streaming completes

- **WHEN** 一条助手消息完成流式渲染（streaming 结束）
- **THEN** 消息下方 SHALL 显示包含复制、点赞、踩三个按钮的操作栏

#### Scenario: Action bar hidden during streaming

- **WHEN** 助手消息正在流式传输中
- **THEN** 操作栏 SHALL 不显示

### Requirement: Copy message content

用户点击复制按钮后，系统 SHALL 将该条消息的纯文本内容写入系统剪贴板，并将按钮图标切换为 ✓ 确认状态，2 秒后恢复原始图标。

#### Scenario: Copy successful

- **WHEN** 用户点击消息操作栏的复制按钮
- **THEN** 消息纯文本内容 SHALL 被写入系统剪贴板
- **AND** 复制按钮图标 SHALL 切换为 ✓ 图标
- **AND** 2 秒后 ✓ 图标 SHALL 恢复为复制图标

#### Scenario: Copy failure (non-Tauri environment)

- **WHEN** 用户在非 Tauri 环境中点击复制按钮
- **THEN** 按钮 SHALL 不显示确认状态（静默降级）

### Requirement: Like/dislike feedback with visual confirmation

用户点击点赞或踩按钮后，系统 SHALL 将按钮图标切换为 ✓ 确认状态，几秒后恢复原始图标，并以结构化格式记录反馈数据。同一消息同一类型的反馈 SHALL 幂等（多次点击只记录一条）。

#### Scenario: Like a message

- **WHEN** 用户点击消息操作栏的点赞按钮
- **THEN** 点赞按钮图标 SHALL 切换为 ✓ 图标
- **AND** 2 秒后 ✓ 图标 SHALL 恢复为点赞图标
- **AND** 系统 SHALL 输出反馈数据 `{ messageId, type: 'like', timestamp, conversationId? }`

#### Scenario: Dislike a message

- **WHEN** 用户点击消息操作栏的踩按钮
- **THEN** 踩按钮图标 SHALL 切换为 ✓ 图标
- **AND** 2 秒后 ✓ 图标 SHALL 恢复为踩图标
- **AND** 系统 SHALL 输出反馈数据 `{ messageId, type: 'dislike', timestamp, conversationId? }`

#### Scenario: Duplicate feedback is idempotent

- **WHEN** 用户对同一消息多次点击同一反馈按钮（如连续点赞）
- **THEN** 系统 SHALL 只记录一条反馈数据
- **AND** 每次点击 SHALL 仍然显示 ✓ 确认状态

### Requirement: Feedback data structure for future agent optimization

反馈数据 SHALL 使用 `{ messageId: string, type: 'like' | 'dislike', timestamp: number, conversationId?: string }` 结构。当前阶段 SHALL 通过 `console.info` 输出，后续 SHALL 可替换为 Rust IPC 命令或远端 API 调用。

#### Scenario: Feedback data is logged

- **WHEN** 用户提交一条反馈（点赞或踩）
- **THEN** 系统 SHALL 以 `console.info('[feedback]', data)` 格式输出结构化数据
- **AND** 数据格式 SHALL 为 `{ messageId, type, timestamp, conversationId? }`
