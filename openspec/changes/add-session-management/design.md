## Context

SettingsModal 当前有 3 个 Tab（主题、快捷键、Agent），采用左侧 44px 导航栏 + 右侧内容区的布局。SessionHeader 提供基础的会话切换/重命名/删除，但缺少一览式管理视图。

侧边车 `AgentSessionMeta` 已包含 `createdAt`/`updatedAt`/`messageCount` 等字段，可直接用于表格展示。表格样式需遵循 `docs/DESIGN.md` 的 concentric-radius 规则和 Markdown 表格的视觉令牌（`outline` 边框、`surface-muted` 表头、11.5px 字体）。

设计范围限定在渲染器前端；侧边车批量删除 API 暂时通过前端循环调用单个 `deleteAgentSession` 实现，后续可优化。

## Goals / Non-Goals

**Goals:**
- 在 SettingsModal 中新增「会话」Tab，展示当前项目所有会话的表格视图
- 表格列：复选框、标题、状态指示灯、消息数、更新时间、操作（重命名/删除）
- 单个会话内联重命名，复用 SessionHeader 的 Enter/Escape/blur 交互模式
- 单个会话删除（两步确认）
- 批量选择 + 批量删除（带确认计数）
- 空状态提示（无会话时）
- 表格视觉完全符合 DESIGN.md 设计令牌

**Non-Goals:**
- 不新增侧边车 API（批量删除通过循环调用单个删除实现）
- 不修改 SessionHeader 现有交互
- 不支持跨项目会话聚合视图（仅当前项目）
- 不支持会话搜索/排序/分页（v1 范围外）
- 不实现会话创建（复用已有 newSession 入口）

## Decisions

### 1. SessionProvider 数据暴露

**决定**: 新增 `listedSessionsMeta: AgentSessionMeta[]` 从 Context 暴露，而不是扩展 `SessionListItem`。

**理由**:
- `SessionListItem` 是 live + listed 的合并视图，丢失了原始时间戳和消息数
- `AgentSessionMeta` 已包含 `createdAt`/`updatedAt`/`messageCount`，直接可用
- `SessionListItem` 保持不变，不影响 SessionHeader 等现有消费者

**备选方案**: 扩展 `SessionListItem` 增加时间戳字段 → 不选，因为现有消费者不需要这些字段，且合并逻辑会变复杂。

### 2. 表格组件实现方式

**决定**: 在 `SessionsSection` 组件内直接使用 Tailwind 类构建表格，不抽取通用 Table 组件。

**理由**:
- 项目中尚无通用 Table 组件，其他场景只有 Markdown 表格
- 会话管理表格是第一个交互式表格，过早抽象会绑定错误假设
- 遵循 FRONTEND.md「compose, don't configure」原则
- 当第二个交互式表格出现时再提取通用组件

**备选方案**: 创建 `src/components/Table.tsx` → 不选，单一用例不足以支撑通用接口设计。

### 3. 批量删除实现

**决定**: 前端顺序循环调用 `deleteAgentSession(id)`，单次操作，带进度反馈。

**理由**:
- 侧边车当前无批量删除端点
- 会话数量通常 < 50，顺序删除延迟可接受
- 避免新增 Rust IPC 命令的复杂性
- 每个 `deleteAgentSession` 内部自带 `detachAgentSession` + 级联清理

**风险**: 部分删除失败时（如中途网络中断），已删除的会话不可恢复。→ 通过一次性确认 + 操作后刷新列表来降低用户预期落差。

### 4. 时间戳格式化

**决定**: 使用相对时间（"2 小时前"、"昨天"、"3 天前"、"6月1日"），用 `Intl.RelativeTimeFormat` 实现。

**理由**:
- 与终端/操作系统惯例一致，用户心智模型匹配
- `label-caps` 样式（11px, uppercase tracking）适合元数据时间展示
- 不需要引入 `date-fns`/`dayjs` 等依赖

### 5. 表格样式

**决定**: 复用 index.css 中 Markdown 表格的视觉令牌，将样式从 `[data-component="markdown"]` 选择器中提取为独立的 Tailwind 工具类组合。

**具体映射**:
| 元素 | Markdown 表格样式 | 会话表格 Tailwind |
|------|------------------|-------------------|
| 容器 | `border-radius: 12px; border: 1px solid outline` | `rounded-[12px] border border-outline` |
| 表头 | `background: surface-muted; font-weight: 600` | `bg-[var(--color-surface-muted)] font-semibold` |
| 单元格 | `font-size: 11.5px; padding: 0.375rem 0.625rem` | `text-[11.5px] px-2.5 py-1.5` |
| 行分隔 | `border-bottom: 1px solid outline` | `border-b border-outline` |
| 行 hover | 无（Markdown 只读） | `hover:bg-[var(--color-surface-muted)]/50` |

## Risks / Trade-offs

- **批量删除部分失败**: 前端顺序调用，若第 N 个失败，前 N-1 个已删除不可回滚。→ 操作前明确提示"此操作不可撤销"，操作后刷新列表。
- **Agent 离线时表格为空**: 会话列表依赖侧边车 API，离线时表格为空。→ 已有 AgentSection 显示连接状态，用户能感知断连。
- **设置弹窗高度**: 表格行数多时需滚动，固定 520px 高度可能偏小。→ 表格区域 `overflow-y-auto`，保持弹窗尺寸不变。
