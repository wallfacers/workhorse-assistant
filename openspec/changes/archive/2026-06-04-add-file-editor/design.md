## Context

Workhorse 是一个基于 Tauri 的 AI 工作站桌面应用，采用三栏布局（左 Agent Rail / 中 TerminalWorkspace / 右 RightPanel）。当前：

- 右侧面板的 Directory 标签页使用 `right-panel.mock.ts` 中的硬编码 `MOCK_FILE_TREE` 数据
- 中间面板的 `TerminalWorkspace` 有一个成熟的 Group/Tab 系统：每个 Group 对应 TabBar 中的一个 Tab，Group 内部是一个可分屏的终端树（`PaneNode` / `SplitNode`）
- Rust 后端已有 `agent_fs_list` 命令（走 sidecar HTTP API），但没有文件读取、写入、重命名能力
- 前端已有 `src/ipc/agent.ts` 中的 `fsList()` 函数和 `FsEntry` / `FsListing` 类型
- 项目使用 `docs/DESIGN.md` 定义的设计 token 系统，所有组件通过 CSS 变量消费颜色

## Goals / Non-Goals

**Goals:**

- 在右侧面板 Directory 标签页中展示真实项目文件树（从 Mock 切换到 `fsList` API）
- 在中间面板 TabBar 中支持「编辑器 Tab」，与终端 Tab 平级共存
- 点击文件树中的文件 → 打开编辑器 Tab → 展示文件内容，可编辑
- 支持保存文件（Ctrl+S）、重命名文件（右键菜单）
- 多语言语法高亮（CodeMirror 6 语言包）
- 主题对齐 DESIGN.md CSS 变量体系
- Tab 关闭时未保存提示

**Non-Goals:**

- 不实现创建文件/文件夹、删除文件、拖拽移动
- 不实现 IntelliSense、代码补全、代码跳转
- 不实现 Git diff 集成
- 不实现多光标编辑、代码折叠（CodeMirror 6 支持但初版不启用）
- 不实现文件搜索（Ctrl+P）

## Decisions

### D1: Group 扩展而非新建 Tab 系统

**决策**: 在现有 `workspaceReducer` 的 `Group` 类型上新增 `kind` 字段，而非创建独立的编辑器 Tab 系统。

**理由**: TerminalWorkspace 的 TabBar 已经是成熟的 pill 样式 Tab 系统，支持关闭、切换、新增。将编辑器 Tab 混入是最小改动方案——TabBar、reducer 核心逻辑、TerminalGroup 完全不需要改，只在 `TerminalWorkspace` 的渲染层加一个 `group.kind === 'editor' ? <FileEditor /> : <TerminalGroup />` 分支。

**替代方案**: 创建独立的 EditorTabBar + EditorPanel → 需要两套 Tab 系统、两套 reducer 逻辑，维护成本翻倍。

### D2: 文件操作走 Tauri std::fs 而非 sidecar API

**决策**: 新增 `agent_fs_read`、`agent_fs_write`、`agent_fs_rename` 三个 Tauri command，在 Rust 层用 `std::fs` 直接操作文件系统。

**理由**: 文件读写是纯本地操作，不需要 sidecar 的 agent 上下文。`std::fs` 零网络开销，延迟是微秒级。现有的 `agent_fs_list` 走 sidecar 是因为它需要 agent 的项目路径解析逻辑，但文件内容读写不需要。

**替代方案**: 给 sidecar 加 HTTP API → 需要改 Go/Rust sidecar 代码，引入网络延迟，且 sidecar 不一定在所有场景都可用。

### D3: CodeMirror 6 作为编辑器引擎

**决策**: 使用 CodeMirror 6 而非 Monaco Editor。

**理由**:
1. **性能**: ~200KB vs ~4MB，多 Tab 实例开销极低（共享核心）
2. **Tauri 兼容**: 轻量 DOM 模型适配系统 WebView（尤其 Linux WebKitGTK 不卡顿）
3. **主题**: `EditorView.theme()` + `HighlightStyle` 可直接映射 CSS 变量，完美对接 DESIGN.md
4. **语言**: 官方 16 个语言包覆盖主流语言，CM5 兼容层可扩展到 130+

**替代方案**: Monaco Editor → 语言支持更广（85+），但体积大、DOM 密集在 Tauri WebView 上有性能报告、主题映射到 DESIGN.md 需要大量手动工作。

### D4: 语言包按需加载策略

**决策**: 安装所有需要的 `@codemirror/lang-*` 包作为直接依赖，通过文件扩展名映射表选择语言扩展，不做动态 import。

**理由**: 每个 CM6 语言包只有几 KB，打包后总体积增加不到 50KB。动态 import 增加复杂度但收益极小。在 `FileEditor.tsx` 中维护一个 `extension → LanguageSupport[]` 映射表即可。

**语言包清单**: javascript, typescript (通过 lang-javascript 的 typescript() 支持), python, rust, html, css, json, markdown, java, cpp, sql, xml, go (社区包 `@codemirror/lang-go` 或 CM5 兼容)。

### D5: 编辑器主题映射策略

**决策**: 使用 `EditorView.theme()` 定义编辑器 chrome（背景、行号、光标、选区、gutter），使用 `HighlightStyle.define()` 定义语法 token 颜色，两者都引用 `docs/DESIGN.md` 的 CSS 变量。

映射表：

| DESIGN.md Token | CodeMirror 用途 |
|---|---|
| `--color-surface` | 编辑器背景 |
| `--color-on-surface` | 默认文本颜色 |
| `--color-on-surface-muted` | 行号、注释 |
| `--color-outline` | Gutter 边线 |
| `--color-primary` | 关键字 |
| `--color-tertiary` | 字符串 |
| `--color-accent-warm` | 类型名、内置 |
| `--color-surface-muted` | 选区背景 |
| `--color-danger` | 错误 token |

### D6: 文件树懒加载策略

**决策**: 初始加载根目录第一层，展开文件夹时调用 `fsList(path)` 加载子目录，展开状态由组件本地 state 管理。

**理由**: 避免一次性加载整个项目文件树（大项目可能有数万节点）。`FsEntry` 已有 `kind` 字段区分文件/文件夹，文件夹可标记为 `loaded: false`，展开时按需加载。

### D7: 文件树与编辑器 Tab 的通信

**决策**: FileTree 组件通过 `dispatch({ type: 'addEditorGroup', filePath })` 向 workspaceReducer 发送 action，workspaceReducer 创建新的 editor Group。FileTree 不需要直接引用 FileEditor。

**理由**: 保持单向数据流。FileTree 只负责发 action，TerminalWorkspace 根据 Group.kind 负责渲染。

## Risks / Trade-offs

- **[CodeMirror 生产构建兼容性]** → Tauri + Vite 打包 CM6 有[个别案例报告](https://discuss.codemirror.net/t/tauri-sveltekit-vite-codemirror-6-works-in-dev-breaks-in-production-build/9339)。缓解：在 Phase 2 完成后立即测试 `npm run tauri:dev` 和生产构建。
- **[std::fs 路径安全]** → 直接操作文件系统需要路径校验，防止路径遍历攻击。缓解：Rust 侧验证路径在项目 workdir 范围内。
- **[大文件性能]** → 超大文件（>1MB）可能导致编辑器卡顿。缓解：初版不做虚拟化，但限制文件大小（>2MB 时提示用户文件过大，用只读模式或外部编辑器打开）。
- **[CM6 官方语言包只有 16 种]** → 不如 Monaco 的 85+ 种广泛。缓解：CM5 兼容层可覆盖 130+，且 16 种官方包已覆盖绝大多数开发场景。
