import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

/**
 * Collapsible tool-call block inspired by data-talk's basic-tool.tsx.
 *
 * Renders a `<details>` element showing the tool name and status indicator.
 * Expanded view shows input arguments and output. During streaming (status=running),
 * an amber pulsing dot signals activity.
 */

export interface ToolCallData {
  name: string;
  input?: unknown;
  status: 'running' | 'done' | 'error';
  output?: unknown;
}

const STATUS_DOT: Record<ToolCallData['status'], string> = {
  running: 'bg-amber-400 animate-pulse',
  done: 'bg-green-500',
  error: 'bg-red-500',
};

const STATUS_LABEL: Record<ToolCallData['status'], string> = {
  running: '运行中…',
  done: '完成',
  error: '出错',
};

export default function ToolCallBlock({ tool }: { tool: ToolCallData }) {
  const [open, setOpen] = useState(false);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="my-1.5 rounded-md border border-outline/40 dark:border-neutral-700/50 bg-surface-muted/60 dark:bg-neutral-800/40"
    >
      <summary className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer select-none text-[11.5px] hover:bg-gray-100/60 dark:hover:bg-neutral-800/60 rounded-md transition-colors">
        {open ? (
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
        )}
        <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
          {tool.name}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[tool.status]}`} />
        <span className="text-gray-400 dark:text-gray-500 text-[10.5px]">
          {STATUS_LABEL[tool.status]}
        </span>
      </summary>
      {(tool.input !== undefined || tool.output !== undefined) && (
        <div className="px-2.5 pb-2 space-y-1.5">
          {tool.input !== undefined && (
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">输入</p>
              <pre className="text-[10.5px] font-mono bg-white dark:bg-neutral-900 rounded p-2 overflow-x-auto custom-scrollbar text-gray-700 dark:text-gray-300 border border-outline/30 dark:border-neutral-700/40">
                {typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.output !== undefined && (
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">输出</p>
              <pre className="text-[10.5px] font-mono bg-white dark:bg-neutral-900 rounded p-2 overflow-x-auto custom-scrollbar text-gray-700 dark:text-gray-300 border border-outline/30 dark:border-neutral-700/40">
                {typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
