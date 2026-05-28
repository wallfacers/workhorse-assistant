import { useEffect, useRef, useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import type { ProfileId } from '../../ipc';
import { PROFILE_LABELS, PROFILE_ORDER } from './profiles';

interface ProfileMenuProps {
  /** Receives the canonical `ProfileId` (never the display label) — D6/G. */
  onSelect: (profileId: ProfileId) => void;
  /** `tab` = the `+▾` new-group trigger; `pane` = the small split `+`. */
  variant: 'tab' | 'pane';
  /** Optional trigger text (used by the empty-state "新建终端" prompt). */
  label?: string;
  title?: string;
}

/**
 * The one profile picker, reused by the tab bar (new group) and each pane
 * (split). It renders the display labels but `onSelect` always yields the
 * canonical `ProfileId`, so the core's profile map never misses on a `+`/`-`
 * mismatch.
 */
export default function ProfileMenu({
  onSelect,
  variant,
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

  const triggerClass =
    variant === 'tab'
      ? 'flex items-center gap-1 px-2 py-1 rounded-md text-[12.5px] text-gray-500 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-neutral-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors'
      : 'flex items-center justify-center w-6 h-6 rounded-md text-gray-400 dark:text-gray-500 hover:bg-neutral-700/60 hover:text-gray-200 transition-colors';

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        title={title ?? '新建终端'}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={triggerClass}
      >
        <Plus className="w-3.5 h-3.5" />
        {label && <span>{label}</span>}
        {variant === 'tab' && <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-[160px] py-1 bg-white dark:bg-surface-dark-elevated border border-outline dark:border-neutral-800 rounded-lg shadow-lg">
          {PROFILE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                pick(id);
              }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-neutral-800 transition-colors"
            >
              {PROFILE_LABELS[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
