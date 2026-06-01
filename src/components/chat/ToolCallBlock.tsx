import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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


export default function ToolCallBlock({ tool }: { tool: ToolCallData }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const statusLabel: Record<ToolCallData['status'], string> = {
    running: t('toolCall.running'),
    done: t('toolCall.done'),
    error: t('toolCall.error'),
  };

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="my-1.5"
    >
      <summary className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer select-none text-[11.5px] hover:bg-gray-100/60 dark:hover:bg-neutral-800/60 transition-colors">
        {open ? (
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
        )}
        <span className="inline-flex items-center gap-1 font-mono font-medium text-[11px] rounded-sm border px-1.5 py-0.5 bg-secondary/10 text-secondary dark:bg-secondary/20 dark:text-[#5bb5cc] border-secondary/20 dark:border-secondary/30">
          <Wrench className="w-3 h-3" />
          {tool.name}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[tool.status]}`} />
        <span className="text-gray-400 dark:text-gray-500 text-[10.5px]">
          {statusLabel[tool.status]}
        </span>
      </summary>
      {(tool.input !== undefined || tool.output !== undefined) && (
        <div className="ml-5 mt-1.5 rounded-sm border border-outline/30 dark:border-neutral-700/40 bg-white dark:bg-neutral-900 p-2 space-y-1.5">
          {tool.input !== undefined && (
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">{t('toolCall.input')}</p>
              <pre className="text-[10.5px] font-mono bg-white dark:bg-neutral-900 rounded p-2 overflow-x-auto custom-scrollbar text-gray-700 dark:text-gray-300 border border-outline/30 dark:border-neutral-700/40">
                {typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.output !== undefined && (
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">{t('toolCall.output')}</p>
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
