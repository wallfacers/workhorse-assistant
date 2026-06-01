## 1. SessionProvider 扩展

- [x] 1.1 在 `SessionProvider.tsx` 中暴露 `listedSessionsMeta: AgentSessionMeta[]` 到 Context value
- [x] 1.2 更新 `SessionContextValue` 接口，添加 `listedSessionsMeta` 字段

## 2. i18n 翻译

- [x] 2.1 在 `zh-CN.json` 中新增 `sessions` 命名空间：标题、表头、空状态、确认删除、批量操作等
- [x] 2.2 在 `en-US.json` 中添加对应英文翻译

## 3. 核心 UI — SessionsSection 组件

- [x] 3.1 在 `SettingsModal.tsx` 中新增 `SessionsSection` 组件骨架（读取 listedSessionsMeta 渲染表格）
- [x] 3.2 实现表格视图：表头 + 数据行，按设计令牌使用 Tailwind 类（rounded-[12px]、outline 边框、surface-muted 表头、11.5px 字体）
- [x] 3.3 实现状态指示灯（idle 灰色 / running 绿色脉冲）
- [x] 3.4 实现相对时间格式化（relativeTime 辅助函数，中英双语支持）
- [x] 3.5 实现空状态视图（无会话时显示提示）

## 4. 会话操作

- [x] 4.1 实现内联重命名（编辑图标 → 输入框 → Enter/Escape/blur 交互）
- [x] 4.2 实现单个删除（两步确认模式）
- [x] 4.3 实现删除后成功提示（通过 deleteSession 内部 fallback 处理活跃会话切换）

## 5. 批量选择和删除

- [x] 5.1 实现行复选框 + 表头全选复选框 + 三态（全选/部分选/未选）
- [x] 5.2 实现批量删除工具栏（选中计数 + "删除选中(N)" 按钮）
- [x] 5.3 实现批量删除确认横幅（危险色确认 + 取消按钮）
- [x] 5.4 实现批量删除执行（顺序调用 deleteAgentSession，完成后刷新 + 成功提示）

## 6. 集成

- [x] 6.1 在 SettingsModal 的 NavItem 类型中新增 `'sessions'`，添加第 4 个导航按钮
- [x] 6.2 将 `sessions` Tab 的导航按钮插入到 `['theme', 'shortcuts', 'agent', 'sessions']` 列表
- [x] 6.3 运行 `npm run lint` 确保类型检查通过
- [x] 6.4 手动验证：打开设置 → 会话 Tab → 查看列表 → 重命名 → 单个删除 → 批量删除 → 空状态
