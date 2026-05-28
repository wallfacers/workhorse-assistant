export type MockTask = { id: string; title: string; active?: boolean };

export const MOCK_TASKS: MockTask[] = [
  { id: '1', title: '重构终端拆分布局', active: true },
  { id: '2', title: '添加文件树预览功能' },
  { id: '3', title: '修复暗色模式切换' },
  { id: '4', title: '优化面板折叠动画' },
  { id: '5', title: '实现 PTY 命令队列' },
];
