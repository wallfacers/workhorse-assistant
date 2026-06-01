# ToolCallBlock Badge 化重新设计

**日期：** 2026-06-02
**状态：** 已批准

## 目标

将 `ToolCallBlock.tsx` 中的工具名称从纯 monospace 文字改为彩色 badge/pill 标签，
同时将 summary 行从全宽边框卡片改为轻量横条，使其与 `ReasoningPart` 的折叠风格一致。

## 视觉改动

### 外层容器

- **移除：** `rounded-md border border-outline/40 dark:border-neutral-700/50 bg-surface-muted/60 dark:bg-neutral-800/40`
- **改为：** 仅保留 `my-1.5`，无边框、无背景

### Badge（工具名 pill）

工具名包裹在彩色 pill 中：

| Token | 浅色 | 深色 |
|-------|------|------|
| 背景 | `bg-secondary/10` | `dark:bg-secondary/20` |
| 文字 | `text-secondary` | `dark:text-[#5bb5cc]` |
| 边框 | `border border-secondary/20` | `dark:border dark:border-secondary/30` |
| 圆角 | `rounded-sm`（8px） | 同 |
| 字号 | `text-[11px]` | 同 |
| 字重 | `font-medium` | 同 |
| 字体系列 | `font-mono` | 同 |

### Badge 内图标

在工具名左侧添加通用工具图标 `Wrench`（Lucide，`w-3 h-3`）。
先不建图标映射表，后续可以按需迭代。

### Summary 行布局

```
Chevron → [🔧 tool_name]  ●  完成
```

- Chevron 图标：展开时 `ChevronDown`，折叠时 `ChevronRight`，切换动画 200ms
- Badge：如上
- 状态圆点：保持现有三色（amber pulsing / green / red）
- 状态文字：保持现有 i18n key（`toolCall.running/done/error`）
- hover 效果：`hover:bg-gray-100/60 dark:hover:bg-neutral-800/60`（保持）

### 展开区域

- 展开时在 summary 下方显示，左缩进与 badge 对齐
- Input/Output pre 块样式保持不变
- 展开区用独立卡片 `rounded-sm`，去重外层容器的旧边框

### 暗色模式

所有颜色使用 Tailwind `dark:` 变体，不引入组件级暗色逻辑。

## 文件改动

**`src/components/chat/ToolCallBlock.tsx`** — 唯一改动的文件。改动点：
1. 移除 `<details>` 外层容器的边框/背景 className
2. 在 summary 内，将 `<span className="font-mono font-medium">` 替换为 badge `<span>` 包裹图标 + 工具名
3. 在展开区域的容器上添加独立的卡片样式（之前继承自外层 details）

无新文件、无类型变更、无 i18n 新增 key。

## 边界情况

- **长工具名：** badge 随文字宽度自适应，不截断（工具名一般较短）
- **streaming 状态：** badge 样式不变，状态圆点保持 amber pulsing
- **error 状态：** badge 样式不变，状态圆点变红、文字变"出错"
- **无 input / 无 output：** 和现有行为一致，不渲染对应 pre 块
- **同时多个 tool_call：** 每个独立渲染，互不影响

## 自检

- [x] 无 placeholder / TODO
- [x] 无内部矛盾
- [x] 范围聚焦在单个组件
- [x] 无不明确的需求
