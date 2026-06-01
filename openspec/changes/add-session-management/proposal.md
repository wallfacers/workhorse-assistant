## Why

当前会话管理仅通过 AgentRail 顶部的 SessionHeader 下拉菜单操作，每次只能看到当前活跃会话，无法一览所有会话、也无法批量清理。设置弹窗已有「主题」「快捷键」「Agent」三个 Tab，但缺少会话维度的管理能力。用户需要在一个集中的视图中查看、重命名、删除会话。

## What Changes

- 在 SettingsModal 中新增第 4 个导航 Tab：「会话」
- 会话 Tab 内展示一个符合 DESIGN.md 表格规范的交互式会话列表，列包含：复选框、标题、状态、消息数、更新时间、操作
- 支持单个会话内联重命名（复用 SessionHeader 已验证的交互模式）
- 支持单个会话删除（带确认）
- 支持批量选择并删除会话
- SessionProvider 暴露原始 `AgentSessionMeta[]` 数据（含时间戳），供表格消费
- 新增 i18n 翻译键（中/英）覆盖会话管理相关文案

## Capabilities

### New Capabilities

- `session-management`: 设置弹窗内的会话管理 Tab — 表格列表、内联重命名、单个/批量删除

### Modified Capabilities

<!-- 本次不修改已有 capability 的需求，仅是新增管理入口 -->

## Impact

- `src/components/SettingsModal.tsx` — 新增 SessionsSection 组件 + 第 4 个 Tab
- `src/session/SessionProvider.tsx` — 暴露 `listedSessions` 原始数据（AgentSessionMeta[]）
- `src/i18n/locales/zh-CN.json` — 新增 sessions.* 翻译键
- `src/i18n/locales/en-US.json` — 对应英文翻译
- 如需批量删除 API：`src/ipc/agent.ts` + Rust 侧 `src-tauri/` 新增 `agent_batch_delete_sessions` 命令
- 表格样式遵循 `docs/DESIGN.md` 设计令牌，使用 Tailwind 工具类，不新增独立 CSS
