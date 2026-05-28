import { SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react';
import Terminal from '../Terminal';
import type { PaneNode } from './workspaceReducer';

interface PaneCardProps {
  node: PaneNode;
  isActive: boolean;
  totalPanes: number;
  onSplit: (direction: 'row' | 'column') => void;
  onClose: () => void;
  onActivate: () => void;
}

/**
 * A clean pane card — rounded container with 1px outline and the terminal
 * filling it. Split/close controls appear only on hover in the top-right
 * corner. The active pane gets a `primary-container` accent border; inactive
 * panes use `outline`/`outline-dark` (design D3).
 */
export default function PaneCard({
  node,
  isActive,
  totalPanes,
  onSplit,
  onClose,
  onActivate,
}: PaneCardProps) {
  const showAccent = isActive && totalPanes > 1;

  return (
    <div
      data-pane-id={node.id}
      onMouseDown={onActivate}
      className={`group relative flex h-full w-full min-h-0 min-w-0 flex-col rounded-md border transition-colors overflow-hidden ${
        showAccent
          ? 'border-primary-container'
          : 'border-outline dark:border-outline-dark'
      }`}
    >
      {/* Terminal fills the card */}
      <div className="flex-1 min-h-0">
        <Terminal key={node.id} profileId={node.profileId} />
      </div>

      {/* Hover overlay — small top-right cluster, pointer-events-none at rest */}
      <div className="pointer-events-none absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label="向右分屏"
          title="向右分屏"
          onClick={(e) => {
            e.stopPropagation();
            onSplit('row');
          }}
          className="flex items-center justify-center rounded p-1 text-gray-400 hover:bg-neutral-700/60 hover:text-gray-200 transition-colors"
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="向下分屏"
          title="向下分屏"
          onClick={(e) => {
            e.stopPropagation();
            onSplit('column');
          }}
          className="flex items-center justify-center rounded p-1 text-gray-400 hover:bg-neutral-700/60 hover:text-gray-200 transition-colors"
        >
          <SplitSquareVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="关闭分屏"
          title="关闭"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="flex items-center justify-center rounded p-1 text-gray-400 hover:bg-neutral-700/60 hover:text-gray-200 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
