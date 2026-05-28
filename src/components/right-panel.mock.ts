export type TaskDetails = {
  accessId: string;
  tags: string[];
  created: string;
  branch: string;
  originalPrompt: string;
};

export type FileNode = {
  name: string;
  kind: 'folder' | 'file';
  children?: FileNode[];
};

export const MOCK_TASK_DETAILS: TaskDetails = {
  accessId: 'TASK-2026-0042',
  tags: ['重构', '前端', '布局'],
  created: '2026/05/29 14:30',
  branch: 'feat/three-pane-shell',
  originalPrompt: '将应用拆分为三栏布局：左侧 Agent 任务轨道、中间终端工作区、右侧工作面板',
};

export const MOCK_FILE_TREE: FileNode[] = [
  {
    name: 'src',
    kind: 'folder',
    children: [
      {
        name: 'components',
        kind: 'folder',
        children: [
          { name: 'AgentRail.tsx', kind: 'file' },
          { name: 'FileTree.tsx', kind: 'file' },
          { name: 'RightPanel.tsx', kind: 'file' },
          {
            name: 'terminal',
            kind: 'folder',
            children: [
              { name: 'TerminalWorkspace.tsx', kind: 'file' },
              { name: 'TabBar.tsx', kind: 'file' },
              { name: 'PaneCard.tsx', kind: 'file' },
            ],
          },
        ],
      },
      { name: 'App.tsx', kind: 'file' },
      { name: 'index.css', kind: 'file' },
    ],
  },
  {
    name: 'docs',
    kind: 'folder',
    children: [
      { name: 'DESIGN.md', kind: 'file' },
      { name: 'ARCHITECTURE.md', kind: 'file' },
      { name: 'FRONTEND.md', kind: 'file' },
    ],
  },
  { name: 'package.json', kind: 'file' },
  { name: 'CLAUDE.md', kind: 'file' },
];
