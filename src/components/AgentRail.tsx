import { useState } from 'react';
import { Search, Moon, Sun, Send, Cpu, Wrench } from 'lucide-react';
import { MOCK_TASKS } from './agent-rail.mock';

export default function AgentRail({
  isDarkMode,
  setIsDarkMode,
}: {
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
}) {
  const [taskInput, setTaskInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="w-64 bg-white dark:bg-surface-dark-elevated flex flex-col rounded-lg border border-outline dark:border-neutral-800/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] h-full text-[13px] flex-shrink-0 overflow-hidden">
      {/* Task Composer */}
      <div className="p-3 space-y-2">
        <textarea
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          placeholder="描述一个新任务…"
          rows={3}
          className="w-full resize-none rounded-xl border border-outline dark:border-neutral-800 bg-surface-muted dark:bg-surface-dark px-3 py-2 outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-neutral-700 transition-shadow text-on-canvas dark:text-on-canvas-dark placeholder-gray-400 dark:placeholder-gray-500 text-[13px]"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-lg bg-surface-muted dark:bg-surface-dark px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-400 border border-outline/50 dark:border-neutral-800/60">
              <Cpu className="w-3 h-3" />
              Claude Sonnet
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-primary-container/10 dark:bg-primary-container/20 px-2 py-0.5 text-[11px] text-primary-container dark:text-on-primary-container border border-primary-container/20">
              <Wrench className="w-3 h-3" />
              工具已启用
            </span>
          </div>
          <button
            type="button"
            aria-label="发送任务"
            className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-200/70 dark:hover:bg-neutral-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索任务…"
            className="w-full pl-9 pr-3 py-1.5 bg-surface-muted dark:bg-surface-dark border border-outline dark:border-neutral-800 rounded-xl outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-neutral-700 transition-shadow dark:text-on-canvas-dark placeholder-gray-400 dark:placeholder-gray-500 text-[13px]"
          />
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 custom-scrollbar">
        <div className="px-2 pb-1 text-[11px] font-medium text-gray-400 dark:text-gray-500 tracking-wider">
          任务列表
        </div>
        <div className="space-y-0.5">
          {MOCK_TASKS.map((task) => (
            <button
              key={task.id}
              className={`w-full text-left px-3 py-2 rounded-xl transition-all duration-150 text-[13px] truncate ${
                task.active
                  ? 'bg-gray-200/70 dark:bg-neutral-800/90 text-gray-900 dark:text-gray-100 font-medium'
                  : 'hover:bg-gray-200/40 dark:hover:bg-neutral-800/50 text-gray-600 dark:text-gray-400'
              }`}
              {...(task.active ? { 'aria-current': 'true' } : {})}
            >
              {task.title}
            </button>
          ))}
        </div>
      </div>

      {/* Footer — Dark Mode Toggle */}
      <div className="p-3 border-t border-outline/50 dark:border-neutral-800/60 flex items-center justify-end">
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-1.5 rounded-xl hover:bg-gray-200/80 dark:hover:bg-neutral-800 text-gray-500 dark:text-gray-400 transition-colors"
          title="切换深色模式"
          aria-label="Toggle dark mode"
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
