import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface ContextMenuState {
  x: number;
  y: number;
  nodePath: string;
  nodeName: string;
  nodeKind: 'file' | 'folder';
}

interface TreeContextMenuProps {
  menu: ContextMenuState;
  onRename: (nodePath: string, nodeName: string) => void;
  onClose: () => void;
}

/**
 * Right-click context menu for file tree nodes. Positioned at the cursor
 * location, styled per DESIGN.md tokens.
 */
export default function TreeContextMenu({ menu, onRename, onClose }: TreeContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[var(--z-tooltip,80)] bg-surface dark:bg-surface-dark-elevated rounded-lg border border-outline dark:border-outline-dark shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] py-1 min-w-[140px]"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        type="button"
        className="w-full px-3 py-1.5 text-left text-[12px] text-on-surface dark:text-on-canvas-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors flex items-center gap-2"
        onClick={() => { onRename(menu.nodePath, menu.nodeName); onClose(); }}
      >
        <span>{t('fileTree.rename')}</span>
      </button>
    </div>
  );
}
