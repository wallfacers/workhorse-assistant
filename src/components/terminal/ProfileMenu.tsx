import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ProfileId } from '../../ipc';
import { PROFILE_LABELS, PROFILE_ORDER } from './profiles';

interface ProfileMenuProps {
  /** Receives the canonical `ProfileId` (never the display label) — D6/G. */
  onSelect: (profileId: ProfileId) => void;
  /** Optional trigger text (used by the empty-state "新建终端" prompt). */
  label?: string;
  title?: string;
}

/**
 * Profile picker for creating new terminal groups. The trigger is a clean `+`
 * (icon-only in the tab bar, or with a label for the empty state); clicking it
 * opens the picker. `onSelect` always yields the canonical `ProfileId`, so the
 * core's profile map never misses on a `+`/`-` display mismatch.
 */
export default function ProfileMenu({
  onSelect,
  label,
  title,
}: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (id: ProfileId) => {
    setOpen(false);
    onSelect(id);
  };

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        title={title ?? '新建终端'}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`flex h-7 items-center gap-1 rounded-md text-on-canvas/55 transition-colors hover:bg-surface/70 hover:text-on-canvas dark:text-on-canvas-dark/55 dark:hover:bg-surface-dark-elevated/60 dark:hover:text-on-canvas-dark ${
          label ? 'px-2.5 text-[12.5px]' : 'w-7 justify-center'
        } ${open ? 'bg-surface text-on-canvas dark:bg-surface-dark-elevated dark:text-on-canvas-dark' : ''}`}
      >
        <Plus className="h-4 w-4" />
        {label && <span>{label}</span>}
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 min-w-[160px] overflow-hidden rounded-md border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
          {PROFILE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                pick(id);
              }}
              className="w-full px-3 py-1.5 text-left text-[13px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
            >
              {PROFILE_LABELS[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
