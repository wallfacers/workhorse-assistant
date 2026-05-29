import { useState } from 'react';
import { ArrowUp, Copy, LayoutList, Plus, Settings, ThumbsDown, ThumbsUp } from 'lucide-react';
import { MOCK_MESSAGES, MOCK_TASKS } from './agent-rail.mock';
import type { MockTask } from './agent-rail.mock';
import TaskListModal from './TaskListModal';
import SettingsModal from './SettingsModal';
import type { AgentConnection } from '../ipc';

/** Footer dot colour + label per connection status. */
const AGENT_STATUS_UI: Record<
  AgentConnection['status'],
  { dot: string; label: string }
> = {
  idle: { dot: 'bg-gray-400', label: '连接 Agent' },
  connecting: { dot: 'bg-amber-400 animate-pulse', label: '连接中…' },
  connected: { dot: 'bg-green-500', label: '已连接' },
  error: { dot: 'bg-red-500', label: '重试连接' },
};

export default function AgentRail({
  isDarkMode,
  setIsDarkMode,
  agent,
}: {
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  agent: AgentConnection;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The selected task is tracked for the task-list modal; its value is not yet
  // surfaced in the rail itself (mock UI), so only the setter is read.
  const [, setActiveTask] = useState<MockTask>(
    MOCK_TASKS.find((t) => t.active) ?? MOCK_TASKS[0]
  );

  const handleSelectTask = (task: MockTask) => setActiveTask(task);

  return (
    <div className="w-[400px] bg-white dark:bg-surface-dark-elevated flex flex-col rounded-lg border border-outline dark:border-neutral-800/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] h-full text-[13px] flex-shrink-0 overflow-hidden">

      {/* Chat bubble scroll area */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-3 space-y-4">
        {MOCK_MESSAGES.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] bg-pink-50 dark:bg-pink-950/40 rounded-xl px-3.5 py-2.5 text-pink-900 dark:text-pink-200 text-[12.5px] leading-relaxed shadow-sm">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-2 items-start">
              <div className="w-6 h-6 flex-shrink-0 rounded-lg bg-gradient-to-br from-orange-400 via-pink-500 to-indigo-500 text-white font-bold text-[10px] flex items-center justify-center shadow-sm">
                W
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-surface-muted dark:bg-surface-dark rounded-xl px-3.5 py-2.5 text-gray-800 dark:text-gray-200 text-[12.5px] leading-relaxed border border-outline/50 dark:border-neutral-800/60">
                  {msg.content}
                </div>
                <div className="flex items-center gap-2 mt-1.5 ml-1 text-gray-400 dark:text-gray-500">
                  <button className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="复制">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="好用">
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="不好">
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Input box */}
      <div className="px-3 pb-2">
        <div className="bg-white dark:bg-surface-dark border border-outline dark:border-neutral-800 rounded-xl px-3 pt-2.5 pb-2 flex flex-col focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-neutral-700 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
          <textarea
            placeholder="请输入任务，交给我来完成"
            rows={3}
            className="w-full resize-none overflow-y-auto custom-scrollbar bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-[12.5px] leading-relaxed"
          />
          <div className="flex items-center justify-between mt-1">
            <button
              type="button"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-outline dark:border-neutral-700 bg-surface-muted dark:bg-neutral-800/80 hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-600 dark:text-gray-300 text-[11.5px] font-semibold transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>选择文件</span>
            </button>
            <button
              type="button"
              aria-label="发送"
              className="p-1.5 rounded-full bg-neutral-200/90 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-gray-600 dark:text-gray-200 transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer — avatar + username + task list + settings */}
      <div className="px-3 pb-3 pt-1 flex items-center justify-between border-t border-outline/50 dark:border-neutral-800/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 via-pink-500 to-indigo-500 flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold shadow-sm">
            W
          </div>
          <span className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[120px]">wallfacers</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              agent.status === 'connected' ? agent.disconnect() : agent.connect()
            }
            disabled={agent.status === 'connecting'}
            title={
              agent.status === 'connected'
                ? `已连接（session ${agent.sessionId}）— 点击断开`
                : agent.status === 'error'
                  ? `连接失败：${agent.error ?? ''}`
                  : '连接到本地 workhorse-agent'
            }
            aria-label="Agent 连接状态"
            data-testid="agent-connection-toggle"
            data-agent-clickable
            className="flex items-center gap-1.5 mr-1 px-2 py-1 rounded-full border border-outline dark:border-neutral-700 hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-600 dark:text-gray-300 text-[11px] font-semibold transition-colors disabled:opacity-60"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${AGENT_STATUS_UI[agent.status].dot}`}
            />
            <span>{AGENT_STATUS_UI[agent.status].label}</span>
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="p-1.5 rounded-xl hover:bg-gray-200/80 dark:hover:bg-neutral-800 text-gray-500 dark:text-gray-400 transition-colors"
            title="任务列表"
            aria-label="打开任务列表"
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-xl hover:bg-gray-200/80 dark:hover:bg-neutral-800 text-gray-500 dark:text-gray-400 transition-colors"
            title="设置"
            aria-label="打开设置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {modalOpen && (
        <TaskListModal
          onClose={() => setModalOpen(false)}
          onSelect={handleSelectTask}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
