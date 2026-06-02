## 1. 反馈基础设施

- [x] 1.1 在 `src/agent/` 或 `src/ipc/` 下新建 `feedback.ts`，定义 `FeedbackData` 类型 `{ messageId, type: 'like' | 'dislike', timestamp, conversationId? }` 和 `submitFeedback(data: FeedbackData): Promise<void>` 函数（当前实现为 `console.info('[feedback]', data)`）
- [x] 1.2 验证 `feedback.ts` 在非 Tauri 环境下可正常调用（不抛异常）

## 2. MessageActionBar 组件

- [x] 2.1 创建 `src/components/chat/MessageActionBar.tsx`，定义 props 接口 `{ content: string; messageId: string; conversationId?: string }`
- [x] 2.2 实现复制按钮：import `writeClipboardText`，点击后写入剪贴板，使用 `useState` 切换 Check 图标，`setTimeout` 2 秒后恢复 Copy 图标
- [x] 2.3 实现点赞按钮：点击后切换 Check 图标，调用 `submitFeedback({ type: 'like' })`，2 秒后恢复 ThumbsUp 图标
- [x] 2.4 实现踩按钮：同上，`type: 'dislike'`，恢复 ThumbsDown 图标
- [x] 2.5 实现幂等逻辑：使用 `useRef<Set<string>>` 追踪已提交的 `${messageId}:${type}`，重复点击跳过 `submitFeedback` 调用但仍显示确认状态
- [x] 2.6 添加样式：复用 AgentRail 中已有的 `flex items-center gap-2 mt-1.5 ml-1 text-gray-400` + hover 样式，按钮尺寸 `w-3 h-3`

## 3. 集成到现有组件

- [x] 3.1 修改 `AgentRail.tsx`：删除第 337–341 行的内联按钮 div，替换为 `<MessageActionBar content={...} messageId={msg.id} />`
- [x] 3.2 修改 `MainChat.tsx`：删除第 93–97 行的内联按钮，替换为 `<MessageActionBar content={...} messageId={mockId} />`（静态参考也需要保持同步）
- [x] 3.3 确认 AgentRail 中 `Copy`、`ThumbsUp`、`ThumbsDown` 的 lucide import 可以移除（已被 MessageActionBar 内部使用）

## 4. 验证

- [x] 4.1 运行 `npm run lint` 确认类型检查通过
- [x] 4.2 运行 `npm run dev` 手动验证：复制按钮可写入剪贴板、点赞/踩按钮显示确认状态后恢复、多次点击幂等（需在浏览器 http://localhost:1420 手动确认）
- [x] 4.3 验证浏览器 console 中输出 `[feedback]` 结构化数据（需在浏览器 DevTools console 手动确认）
