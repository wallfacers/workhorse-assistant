import { X } from 'lucide-react';
import type { ProfileId } from '../../ipc';
import type { Group } from './workspaceReducer';
import Terminal from '../Terminal';
import ProfileMenu from './ProfileMenu';
import { PROFILE_LABELS } from './profiles';

interface TerminalGroupProps {
  group: Group;
  onAddPane: (profileId: ProfileId) => void;
  onClosePane: (paneId: string) => void;
  onActivatePane: (paneId: string) => void;
}

/**
 * A group's panes tiled in an equal-cell grid (design D5). Each pane carries a
 * thin chrome with a `+` split button (opens the picker → `addPane`) and a `×`
 * close button (→ `closePane`). The S0 `Terminal` is the leaf, keyed by pane id
 * so React mounts/unmounts the right xterm+PTY; a split whose spawn fails keeps
 * its pane showing the S0 inline error (no auto-remove).
 */
export default function TerminalGroup({
  group,
  onAddPane,
  onClosePane,
  onActivatePane,
}: TerminalGroupProps) {
  const n = group.panes.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  return (
    <div
      className="grid h-full w-full gap-1.5 p-1.5"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {group.panes.map((pane) => {
        const focused = pane.id === group.activePaneId;
        return (
          <div
            key={pane.id}
            onMouseDown={() => onActivatePane(pane.id)}
            className={`relative flex flex-col min-w-0 min-h-0 rounded-md overflow-hidden border transition-colors ${
              focused && n > 1
                ? 'border-primary-container'
                : 'border-outline dark:border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between h-6 px-2 flex-shrink-0 bg-surface-dark-elevated text-[11px] text-gray-400 select-none">
              <span className="truncate">{PROFILE_LABELS[pane.profileId]}</span>
              <div className="flex items-center gap-0.5">
                <ProfileMenu variant="pane" onSelect={onAddPane} title="分屏" />
                <button
                  type="button"
                  aria-label="关闭分屏"
                  title="关闭"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClosePane(pane.id);
                  }}
                  className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:bg-neutral-700/60 hover:text-gray-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <Terminal key={pane.id} profileId={pane.profileId} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
