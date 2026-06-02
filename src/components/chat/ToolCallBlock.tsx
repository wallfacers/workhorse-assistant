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
  running: 'bg-warning animate-pulse',
  done: 'bg-success',
  error: 'bg-danger',
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
      className="my-1.5 rounded-md border border-outline/40 dark:border-outline-dark/50 bg-surface-muted/60 dark:bg-surface-dark-muted/40"
    >
      <summary className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer select-none text-[11.5px] hover:bg-surface-muted/60 dark:hover:bg-surface-dark-muted/60 rounded-md transition-colors">
        {open ? (
          <ChevronDown className="w-3 h-3 text-on-surface-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-on-surface-muted flex-shrink-0" />
        )}
        <span className="inline-flex items-center gap-1 font-mono font-medium text-[11px] text-secondary dark:text-[#5bb5cc]">
          <Wrench className="w-3 h-3" />
          {tool.name}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[tool.status]}`} />
        <span className="text-on-surface-muted dark:text-on-canvas-dark-muted text-[10.5px]">
          {statusLabel[tool.status]}
        </span>
      </summary>
      {(tool.input !== undefined || tool.output !== undefined) && (
        <div className="px-2.5 pb-2 space-y-1.5">
          {tool.input !== undefined && (
            <div>
              <p className="text-[10px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-0.5">{t('toolCall.input')}</p>
              <pre className="text-[10.5px] font-mono bg-surface dark:bg-surface-dark rounded p-2 overflow-x-auto custom-scrollbar text-on-surface dark:text-on-canvas-dark-muted border border-outline/30 dark:border-outline-dark/40">
                {typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.output !== undefined && (
            <div>
              <p className="text-[10px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-0.5">{t('toolCall.output')}</p>
              <pre className="text-[10.5px] font-mono bg-surface dark:bg-surface-dark rounded p-2 overflow-x-auto custom-scrollbar text-on-surface dark:text-on-canvas-dark-muted border border-outline/30 dark:border-outline-dark/40">
                {typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
