import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { MOCK_TASKS } from './agent-rail.mock';
import type { MockTask } from './agent-rail.mock';

interface TaskListModalProps {
  onClose: () => void;
  onSelect: (task: MockTask) => void;
}

export default function TaskListModal({ onClose, onSelect }: TaskListModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = MOCK_TASKS.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-72 bg-white dark:bg-surface-dark-elevated rounded-2xl border border-outline dark:border-neutral-800 shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">任务列表</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭任务列表"
            className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-200/70 dark:hover:bg-neutral-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索任务…"
              className="w-full pl-8 pr-3 py-1.5 bg-surface-muted dark:bg-surface-dark border border-outline dark:border-neutral-800 rounded-xl outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-neutral-700 transition-shadow text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-[12.5px]"
            />
          </div>
        </div>

        {/* Task list */}
        <div className="px-2 pb-3 max-h-56 overflow-y-auto custom-scrollbar space-y-0.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12px] text-gray-400 dark:text-gray-500">无匹配任务</p>
          ) : (
            filtered.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => { onSelect(task); onClose(); }}
                className={`w-full text-left px-3 py-2 rounded-xl text-[12.5px] truncate transition-all duration-150 ${
                  task.active
                    ? 'bg-gray-200/70 dark:bg-neutral-800/90 text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/40 dark:hover:bg-neutral-800/50 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                {task.title}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
