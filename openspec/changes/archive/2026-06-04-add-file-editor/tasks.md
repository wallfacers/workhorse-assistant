## 1. Rust 后端 — 文件操作命令

- [x] 1.1 在 `src-tauri/src/agent/mod.rs` 中新增 `fs_read` 方法，使用 `std::fs::read_to_string` 读取文件内容，返回 `Result<String, AgentError>`
- [x] 1.2 在 `src-tauri/src/agent/mod.rs` 中新增 `fs_write` 方法，使用 `std::fs::write` 写入文件内容，返回 `Result<(), AgentError>`
- [x] 1.3 在 `src-tauri/src/agent/mod.rs` 中新增 `fs_rename` 方法，使用 `std::fs::rename` 重命名文件/文件夹，返回 `Result<(), AgentError>`
- [x] 1.4 在 `src-tauri/src/lib.rs` 中注册 3 个 Tauri command：`agent_fs_read`、`agent_fs_write`、`agent_fs_rename`，绑定到 AgentBridge 的对应方法
- [x] 1.5 在 Rust 侧添加路径安全校验：验证请求的文件路径在工作目录范围内，防止路径遍历

## 2. IPC 层 — 前端文件操作接口

- [x] 2.1 在 `src/ipc/agent.ts` 中新增 `fsReadFile(path: string): Promise<Result<string>>` 函数，调用 `invoke('agent_fs_read', { path })`
- [x] 2.2 在 `src/ipc/agent.ts` 中新增 `fsWriteFile(path: string, content: string): Promise<Result<void>>` 函数，调用 `invoke('agent_fs_write', { path, content })`
- [x] 2.3 在 `src/ipc/agent.ts` 中新增 `fsRename(oldPath: string, newPath: string): Promise<Result<void>>` 函数，调用 `invoke('agent_fs_rename', { oldPath, newPath })`
- [x] 2.4 在 `src/ipc/index.ts` 中导出新增的 3 个函数

## 3. State 层 — workspaceReducer 扩展

- [x] 3.1 在 `src/components/terminal/workspaceReducer.ts` 的 `Group` 接口中新增 `kind: 'terminal' | 'editor'` 字段（默认 `'terminal'`），新增可选字段 `filePath?: string`
- [x] 3.2 在 `WorkspaceAction` 联合类型中新增 `addEditorGroup` action：`{ type: 'addEditorGroup'; filePath: string }`
- [x] 3.3 在 `workspaceReducer` 的 `switch` 中实现 `addEditorGroup` case：创建 `kind: 'editor'` 的 Group，检查是否已有同 filePath 的 editor Group（若有则 activate 而非重复创建）
- [x] 3.4 修改 `createGroup` 函数，使其生成的 Group 默认 `kind: 'terminal'`
- [x] 3.5 新增 `isDirty` 状态跟踪：在 Group 接口中新增 `isDirty?: boolean`，在 `WorkspaceAction` 中新增 `setGroupDirty` action

## 4. 依赖安装 — CodeMirror 6

- [x] 4.1 安装 CodeMirror 6 核心包：`@codemirror/view`、`@codemirror/state`、`@codemirror/language`、`@codemirror/commands`
- [x] 4.2 安装语言包：`@codemirror/lang-javascript`、`@codemirror/lang-python`、`@codemirror/lang-rust`、`@codemirror/lang-html`、`@codemirror/lang-css`、`@codemirror/lang-json`、`@codemirror/lang-markdown`、`@codemirror/lang-java`、`@codemirror/lang-cpp`、`@codemirror/lang-sql`、`@codemirror/lang-xml`
- [x] 4.3 安装辅助包：`@codemirror/search`（搜索支持）、`@codemirror/autocomplete`（基础自动完成）

## 5. 编辑器组件 — FileEditor

- [x] 5.1 新建 `src/components/editor/FileEditor.tsx`：封装 CodeMirror 6 `EditorView`，接受 `filePath` 和 `isDarkMode` props，通过 `useRef` + `useEffect` 挂载编辑器到 DOM
- [x] 5.2 实现语言映射函数 `getLanguageExtensions(fileName: string): Extension[]`：根据文件扩展名返回对应的 CM6 语言 Support 扩展
- [x] 5.3 实现编辑器主题 `createEditorTheme(isDark: boolean): Extension`：使用 `EditorView.theme()` + `HighlightStyle.define()` 映射 DESIGN.md CSS 变量
- [x] 5.4 在 `FileEditor` 中实现文件加载逻辑：mount 时调用 `fsReadFile(filePath)` 加载内容，通过 `EditorView.dispatch` 设置初始 doc
- [x] 5.5 实现脏标记检测：监听 `EditorView.update` 事件，比较 `docChanged` 标记，通过回调通知父组件更新 `isDirty` 状态
- [x] 5.6 实现 Ctrl+S 保存逻辑：注册 `keymap.of` 快捷键绑定，调用 `fsWriteFile` 写回磁盘，成功后清除脏标记
- [x] 5.7 实现主题切换：当 `isDarkMode` prop 变化时，通过 `EditorView.dispatch` 重新配置 theme extension
- [x] 5.8 处理大文件场景：文件 > 2MB 时显示警告，以只读模式加载

## 6. TabBar 适配

- [x] 6.1 修改 `src/components/terminal/TabBar.tsx`：当 `group.kind === 'editor'` 时，tab label 前显示 `File` 图标（lucide-react）
- [x] 6.2 在 TabBar 中实现脏标记显示：当 `group.isDirty === true` 时，在 tab label 旁显示一个小圆点
- [x] 6.3 修改 `TerminalWorkspace` 的 `groupTitles` 逻辑：editor group 的 title 使用文件 basename（从 `group.filePath` 提取）

## 7. TerminalWorkspace 集成

- [x] 7.1 修改 `src/components/terminal/TerminalWorkspace.tsx`：在 groups.map 渲染中，根据 `g.kind` 条件渲染 `<TerminalGroup />` 或 `<FileEditor />`
- [x] 7.2 实现 editor group 关闭时的未保存确认：拦截 `closeGroup` action，如果 group 的 `isDirty` 为 true，弹出确认对话框（复用现有 ConfirmProvider）
- [x] 7.3 确保 editor group 不参与 splitPane 操作：在 `splitPane` case 中过滤掉 `kind === 'editor'` 的 group

## 8. 真实文件树 — FileTree 改造

- [x] 8.1 新建 `src/components/file-tree/types.ts`：定义 `RealFileNode` 类型（`name`, `kind`, `path`, `loaded?`, `children?`, `loading?`），区别于旧的 Mock `FileNode`
- [x] 8.2 改造 `src/components/FileTree.tsx`：接受 `RealFileNode[]` 和回调 props（`onOpenFile`, `onToggleFolder`, `onRename`），移除 Mock 数据依赖
- [x] 8.3 实现懒加载：`onToggleFolder` 回调触发 `fsList(path)` 调用，结果更新到树 state 中对应节点的 children
- [x] 8.4 实现右键上下文菜单：新建 `src/components/file-tree/TreeContextMenu.tsx`，显示"重命名"选项，定位在鼠标位置
- [x] 8.5 实现行内重命名：选中"重命名"后，节点名变为可编辑 input，Enter 确认调用 `fsRename`，Escape 取消
- [x] 8.6 实现文件打开：`onOpenFile` 回调调用 `dispatch({ type: 'addEditorGroup', filePath })` 打开编辑器 tab
- [x] 8.7 实现文件树刷新：保存/重命名后触发父目录重新加载，更新树视图

## 9. RightPanel 改造

- [x] 9.1 修改 `src/components/RightPanel.tsx`：Directory 标签页从 Mock 数据切换为真实文件树，使用 session 的 `workdir` 作为根路径
- [x] 9.2 在 Directory 标签页中调用 `fsList(workdir)` 加载根目录，将结果传入改造后的 `FileTree` 组件
- [x] 9.3 连接 FileTree 的 `onOpenFile` 回调到 workspaceReducer 的 `addEditorGroup` dispatch
- [x] 9.4 移除 `right-panel.mock.ts` 中的 `MOCK_FILE_TREE` 引用（保留 `MOCK_TASK_DETAILS` 用于 Info 标签页）

## 10. 设计系统 & 收尾

- [x] 10.1 在 `docs/DESIGN.md` 中新增编辑器相关 token（如有需要）：`editor-bg`、`editor-gutter`、`editor-selection` 等，或确认现有 token 足够覆盖
- [x] 10.2 确认所有新增组件无裸 hex 值：运行 `npm run design:lint` 确保通过
- [x] 10.3 新增 i18n key：在 `src/i18n/locales/en-US.json` 和 `zh-CN.json` 中添加编辑器相关翻译（重命名、保存成功/失败、大文件警告等）
- [ ] 10.4 在 `npm run tauri:dev` 中端到端测试：打开文件树 → 点击文件 → 编辑 → 保存 → 重命名 → 关闭 tab
- [ ] 10.5 验证生产构建：`npm run build` 确保 CodeMirror 6 在 Vite 打包后正常工作
