## Context

`ToolCallBlock` 是 AI 对话框中渲染 `tool_call` MessagePart 的组件（`src/components/chat/ToolCallBlock.tsx`）。当前实现是全宽 `<details>` 卡片，summary 行展示 chevron + monospace 工具名 + 状态圆点 + 状态文字，展开后显示 Input/Output pre 块。

同场景下的 `ReasoningPart` 使用轻量的折叠行（无边框、无背景），与 ToolCallBlock 的全宽卡片风格不一致。本次设计让两者统一。

设计系统约束来自 `docs/DESIGN.md`：只有两层 elevation、不使用组件阴影、颜色使用 role tokens、暗色模式通过 `dark:` 变体。

## Goals / Non-Goals

**Goals:**
- 工具名以彩色 badge/pill 展示，一眼可辨识
- Summary 行变轻量横条，与 ReasoningPart 折叠风格一致
- 展开区域保持 Input/Output 功能不变
- 暗色/浅色两套主题正常工作

**Non-Goals:**
- 不改变数据流或 MessagePart 类型
- 不添加工具名→图标映射表（先用通用图标）
- 不改动 AgentRail 或其他消费组件

## Decisions

### 1. Badge 颜色用 secondary token

选用 `secondary`（#0b6477 teal-blue）而非 `primary`（#024a44 deep teal），因为 primary 是用户消息气泡颜色，badge 用小一号的 secondary 有所区分，也符合 DESIGN.md 中 "primary = 用户声音" 的设定。

**暗色模式下 badge 文字颜色：**
- 用 `dark:text-[#5bb5cc]`（secondary 的中明度变体），比纯 white 柔和，在深色背景下可读性好

### 2. 外层容器去边框去背景

移除 `rounded-md border bg-surface-muted/60` 后，ToolCallBlock 变成类似 ReasoningPart 的轻量折叠行。展开区域的 input/output 卡片自身带边框，不会丢失层次感。

### 3. 展开区域独立卡片

展开区域的 input/output pre 块从外层容器中脱离，包裹在独立的 `rounded-sm border` 卡片中。左缩进与 badge 对齐，视觉上明确隶属于上方的 summary 行。

### 4. 保留 `<details>` + `useState` 双控模式

和当前一样，展开状态由 `useState` 跟踪（`open` state），而非纯 uncontrolled details。这为未来可能的动画或程序化控制留空间。

## Risks / Trade-offs

- **Badge 文字溢出：** 工具名一般较短（<20 字符），不截断。如未来出现超长名称，badge 随文字自然扩展即可，无需特殊处理。
- **secondary/10 透明度一致性：** 10% 透明度在白色和深色背景上视觉亮度不同，但 Tailwind 的 `bg-secondary/10` 和 `dark:bg-secondary/20` 已分别适配。深色模式下用 20% 确保 badge 可见。
