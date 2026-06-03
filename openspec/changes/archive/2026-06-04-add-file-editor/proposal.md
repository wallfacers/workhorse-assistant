## Why

当前应用的文件树（右侧面板 Directory 标签页）使用硬编码 Mock 数据，用户无法浏览真实项目文件。同时应用缺少文件查看和编辑能力——用户需要切换到外部 IDE 才能查看或修改文件内容。作为面向开发者的 AI 工作站，基础的文件浏览、查看、编辑能力是核心工作流的一环，应当内置。

## What Changes

- 在右侧面板 Directory 标签页中接入真实文件系统数据（替代 Mock 数据），支持懒加载展开子目录
- 在中间面板（TerminalWorkspace）的 TabBar 中新增「编辑器 Tab」类型，与现有终端 Tab 平级
- 单击文件树中的文件 → 在 TerminalWorkspace 中打开一个编辑器 Tab，展示文件内容
- 编辑器 Tab 内嵌 CodeMirror 6，支持多语言语法高亮、行号、代码编辑
- 支持编辑后保存（Ctrl+S），通过 Tauri Rust 层 `std::fs` 直接写回磁盘
- 文件树支持右键菜单操作：重命名文件/文件夹
- TabBar 上的编辑器 Tab 显示文件名 + 脏标记（未保存修改指示）
- 关闭未保存的编辑器 Tab 时弹出确认对话框
- 所有新增组件的样式严格遵循 `docs/DESIGN.md` 的 CSS 变量体系

## Capabilities

### New Capabilities

- `file-editor`: 代码编辑器 Tab 集成到 TerminalWorkspace，基于 CodeMirror 6 实现文件查看、编辑、保存，支持多语言语法高亮，主题对齐 DESIGN.md
- `file-tree-real`: 真实文件树浏览器，接入 fsList API 实现懒加载目录展开，支持单击打开文件、右键菜单重命名

### Modified Capabilities

- `three-pane-shell`: TerminalWorkspace 的 Group 概念扩展——新增 `kind: 'terminal' | 'editor'` 字段，TabBar 条件渲染编辑器或终端内容；RightPanel 的 Directory 标签页从 Mock 切换到真实数据源

## Impact

- **Rust 后端** (`src-tauri/src/agent/mod.rs`, `src-tauri/src/lib.rs`): 新增 3 个 Tauri command（`agent_fs_read`、`agent_fs_write`、`agent_fs_rename`），使用 `std::fs` 直接操作文件系统
- **IPC 层** (`src/ipc/`): 新增 `fsReadFile()`、`fsWriteFile()`、`fsRename()` 函数
- **State 层** (`src/components/terminal/workspaceReducer.ts`): Group 类型扩展，新增 `addEditorGroup` action
- **组件层**: 新增 `FileEditor.tsx`；改造 `FileTree.tsx`、`RightPanel.tsx`、`TabBar.tsx`、`TerminalWorkspace.tsx`
- **依赖**: 新增 `@codemirror/view`、`@codemirror/state`、`@codemirror/language`、`@codemirror/lang-*` 等包
- **设计系统**: 新增编辑器相关 CSS 变量（编辑器背景、行号、光标、选区等 token）
