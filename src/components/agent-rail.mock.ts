export type MockTask = { id: string; title: string; active?: boolean };

export const MOCK_TASKS: MockTask[] = [
  { id: '1', title: '重构终端拆分布局', active: true },
  { id: '2', title: '添加文件树预览功能' },
  { id: '3', title: '修复暗色模式切换' },
  { id: '4', title: '优化面板折叠动画' },
  { id: '5', title: '实现 PTY 命令队列' },
];

export type Message = { role: 'user' | 'assistant'; content: string };

export const MOCK_MESSAGES: Message[] = [
  {
    role: 'user',
    content: '帮我重构一下终端拆分布局，让分割线更细一些，悬停效果更精致。',
  },
  {
    role: 'assistant',
    content:
      '已完成。将分割线宽度从 4px 缩减至 1px，悬停时以内嵌高亮线替代整条变色，同时将 hover 区域限制在圆角内侧，视觉上更干净。相关改动在 PaneCard.tsx 和 index.css 中。',
  },
  {
    role: 'user',
    content: '不错。再帮我看看右侧面板的布局，需要改成 tab 切换形式。',
  },
];
