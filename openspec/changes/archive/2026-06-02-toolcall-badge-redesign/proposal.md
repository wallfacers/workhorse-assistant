## Why

ToolCallBlock 当前渲染为全宽边框卡片，工具名称仅为 monospace 文字，在对话中不够醒目，也与其他折叠组件（ReasoningPart）风格不一致。改为 badge 化的工具名 + 轻量 summary 行，让工具调用在视觉上即时可辨识，同时与消息流其他元素统一。

## What Changes

- ToolCallBlock 外层容器：移除边框和背景，summary 行变轻量横条
- 工具名称：从纯 monospace 文字改为彩色 pill badge（含工具图标），使用 secondary token
- 展开区域：改为独立卡片，保持现有 Input/Output pre 块样式
- 暗色模式：所有颜色使用 Tailwind `dark:` 变体

## Capabilities

### New Capabilities

- `toolcall-badge`: ToolCallBlock 组件视觉重新设计——badge 化工具名、轻量 summary 行、与 ReasoningPart 折叠风格一致

### Modified Capabilities

<!-- 纯视觉改动，不影响任何现有 spec 级别的行为要求 -->

## Impact

- `src/components/chat/ToolCallBlock.tsx` — 唯一改动文件，约 70 行
