import { SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Terminal from '../Terminal';
import type { PaneNode } from './workspaceReducer';

interface PaneCardProps {
  node: PaneNode;
  isActive: boolean;
  totalPanes: number;
  onSplit: (direction: 'row' | 'column') => void;
  onClose: () => void;
  onActivate: () => void;
  onTitle: (paneId: string, title: string) => void;
}

function ControlButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`flex h-5 w-5 items-center justify-center rounded-sm text-on-canvas/55 transition-colors dark:text-on-canvas-dark/55 ${
        danger
          ? 'hover:bg-danger/10 hover:text-danger'
          : 'hover:bg-black/[0.06] hover:text-on-canvas dark:hover:bg-white/10 dark:hover:text-on-canvas-dark'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A clean pane card. Every pane gets a 1px outline so it reads as a distinct
 * cell — a lone pane and inactive split panes use the neutral `outline`, while
 * the active pane in a split is tinted `primary-container` with a subtle ring
 * glow. Hover adds a faint teal ring for visual feedback (design D3, DESIGN.md
 * "outline to separate surfaces" — the ring is a border-emphasis glow, not an
 * elevation shadow).
 */
export default function PaneCard({
  node,
  isActive,
  totalPanes,
  onSplit,
  onClose,
  onActivate,
  onTitle,
}: PaneCardProps) {
  const { t } = useTranslation();
  const split = totalPanes > 1;
  const showAccent = isActive && split;

  return (
    <div
      data-pane-id={node.id}
      onMouseDown={onActivate}
      className={`group relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border transition-all duration-300 ${
        showAccent
          ? 'border-primary-container ring-1 ring-primary-container/25 hover:ring-2 hover:ring-primary-container/12'
          : 'border-outline dark:border-outline-dark hover:border-primary-container/50 hover:ring-2 hover:ring-primary-container/8'
      }`}
    >
      {/* Reserve a slim top strip (in the terminal's own background color) so the
          PTY's first row starts just below the always-on controls — they share
          the strip instead of overlapping live output. */}
      <div className="min-h-0 flex-1 bg-surface-muted pt-4 dark:bg-surface-dark">
        <Terminal key={node.id} profileId={node.profileId} onTitle={(t) => onTitle(node.id, t)} />
      </div>

      {/* Controls — always on, no chrome of their own: they sit in the reserved
          top strip (terminal background color), so they read as part of the PTY
          rather than a floating pill and never overlap live output. Inset from
          the rounded border so they stay within the cell. They live in the strip
          (no xterm content there), so being always-interactive never steals
          xterm's text selection. */}
      <div className="absolute right-1.5 top-1 flex items-center gap-0.5">
        <ControlButton label={t('terminal.splitRight')} onClick={() => onSplit('row')}>
          <SplitSquareHorizontal className="h-3 w-3" />
        </ControlButton>
        <ControlButton label={t('terminal.splitDown')} onClick={() => onSplit('column')}>
          <SplitSquareVertical className="h-3 w-3" />
        </ControlButton>
        <ControlButton label={t('terminal.close')} onClick={() => onClose()} danger>
          <X className="h-3 w-3" />
        </ControlButton>
      </div>
    </div>
  );
}
