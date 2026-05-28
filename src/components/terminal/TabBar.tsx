import { X } from 'lucide-react';
import type { ProfileId } from '../../ipc';
import type { Group } from './workspaceReducer';
import { countLeaves } from './workspaceReducer';
import ProfileMenu from './ProfileMenu';

interface TabBarProps {
  groups: Group[];
  activeGroupId: string;
  onActivate: (groupId: string) => void;
  onClose: (groupId: string) => void;
  onAddGroup: (profileId: ProfileId) => void;
}

/**
 * One tab per group. The tab shows the group's fixed `label` (set at creation)
 * plus a pane-count badge once the group holds more than one pane (D6/B). The
 * `+▾` trailing trigger opens the profile picker to create a new group.
 */
export default function TabBar({
  groups,
  activeGroupId,
  onActivate,
  onClose,
  onAddGroup,
}: TabBarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 flex-shrink-0 border-b border-outline dark:border-outline-dark bg-surface-muted dark:bg-surface-dark overflow-x-auto custom-scrollbar">
      {groups.map((g) => {
        const active = g.id === activeGroupId;
        const paneCount = countLeaves(g.layout);
        return (
          <div
            key={g.id}
            onClick={() => onActivate(g.id)}
            className={`flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-sm text-[12.5px] cursor-pointer whitespace-nowrap transition-colors ${
              active
                ? 'bg-white dark:bg-surface-dark-elevated text-gray-900 dark:text-gray-100 font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-surface-dark-elevated/70'
            }`}
          >
            <span className="truncate max-w-[160px]">{g.label}</span>
            {paneCount > 1 && (
              <span className="px-1.5 rounded-full bg-outline/60 dark:bg-outline-dark text-[10px] leading-tight text-gray-700 dark:text-gray-200">
                {paneCount}
              </span>
            )}
            <button
              type="button"
              aria-label="关闭终端组"
              title="关闭"
              onClick={(e) => {
                e.stopPropagation();
                onClose(g.id);
              }}
              className="ml-0.5 p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-outline/40 dark:hover:bg-outline-dark/40 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      <ProfileMenu onSelect={onAddGroup} title="新建终端组" />
    </div>
  );
}
