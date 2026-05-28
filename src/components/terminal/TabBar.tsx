import { X } from 'lucide-react';
import type { ProfileId } from '../../ipc';
import type { Group } from './workspaceReducer';
import ProfileMenu from './ProfileMenu';

interface TabBarProps {
  groups: Group[];
  groupTitles: string[];
  activeGroupId: string;
  onActivate: (groupId: string) => void;
  onClose: (groupId: string) => void;
  onAddGroup: (profileId: ProfileId) => void;
}

/**
 * One tab per group, rendered as a segmented-capsule control (mirrors the work
 * panel's 工作日志/产出物/预览 tabs): the whole strip sits in a quiet pill and the
 * active tab lifts onto a white/elevated chip. No header strip or divider — the
 * capsule is the only chrome, floating on the workspace ground. The close
 * affordance stays hidden until hover/active so a resting row reads as quiet
 * labels. The trailing `+` opens the new-group picker.
 */
export default function TabBar({
  groups,
  groupTitles,
  activeGroupId,
  onActivate,
  onClose,
  onAddGroup,
}: TabBarProps) {
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 px-2 py-2">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-outline/50 p-1 custom-scrollbar dark:bg-neutral-800/70">
        {groups.map((g, i) => {
          const active = g.id === activeGroupId;
          return (
            <div
              key={g.id}
              onClick={() => onActivate(g.id)}
              className={`group/tab flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg py-1.5 pl-4 pr-2.5 text-xs font-semibold transition-all duration-150 ${
                active
                  ? 'bg-white text-gray-950 shadow-sm dark:bg-neutral-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <span className="max-w-[200px] truncate">{groupTitles[i]}</span>
              <button
                type="button"
                aria-label="关闭终端组"
                title="关闭"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(g.id);
                }}
                className={`flex h-4 w-4 items-center justify-center rounded transition-all hover:bg-black/10 dark:hover:bg-white/10 ${
                  active
                    ? 'opacity-60 hover:opacity-100'
                    : 'opacity-0 group-hover/tab:opacity-60 hover:!opacity-100'
                }`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <ProfileMenu onSelect={onAddGroup} title="新建终端组" />
    </div>
  );
}
