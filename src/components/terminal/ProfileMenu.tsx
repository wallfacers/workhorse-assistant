import { useEffect, useRef, useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
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
 * Profile picker for creating new terminal groups. Renders display labels
 * but `onSelect` always yields the canonical `ProfileId`, so the core's
 * profile map never misses on a `+`/`-` mismatch.
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
        className="flex items-center gap-1 px-2 py-1 rounded-sm text-[12.5px] text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-surface-dark-elevated/70 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        {label && <span>{label}</span>}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-[160px] py-1 bg-white dark:bg-surface-dark-elevated border border-outline dark:border-outline-dark rounded-md shadow-lg">
          {PROFILE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                pick(id);
              }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors"
            >
              {PROFILE_LABELS[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
