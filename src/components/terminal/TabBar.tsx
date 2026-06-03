import { X, File } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  // px-1 aligns the tab capsule's left edge with the inset-1 content card below
  // it (terminal PaneCard / file-editor card), so a tab sits flush above its panel.
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 px-1 py-2">
      {/* Outer frame: rounded-lg + overflow-hidden clips the scrollbar ends so
           they don't protrude past the rounded corners. */}
      <div className="min-w-0 rounded-lg bg-outline/50 overflow-hidden dark:bg-surface-dark-muted/70">
        <div className="flex items-center gap-1 overflow-x-auto p-1 custom-scrollbar">
          {groups.map((g, i) => {
            const active = g.id === activeGroupId;
            return (
              <div
                key={g.id}
                onClick={() => onActivate(g.id)}
                className={`group/tab flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md py-1.5 pl-4 pr-2.5 text-xs font-semibold transition-colors duration-150 ${
                  active
                    ? 'bg-surface text-on-surface shadow-sm dark:bg-surface-dark-muted dark:text-on-canvas-dark'
                    : 'text-on-surface-muted hover:text-on-surface dark:text-on-canvas-dark-muted dark:hover:text-on-canvas-dark'
                }`}
              >
                {g.kind === 'editor' && (
                  <File className="w-3.5 h-3.5 flex-shrink-0 text-on-surface-muted dark:text-on-canvas-dark-muted" />
                )}
                <span className="max-w-[200px] truncate">{groupTitles[i]}</span>
                {g.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary dark:bg-primary flex-shrink-0" />
                )}
                <button
                  type="button"
                  aria-label={t('terminal.closeGroup')}
                  title={t('terminal.close')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(g.id);
                  }}
                  className={`flex h-4 w-4 items-center justify-center rounded-sm transition-all hover:bg-black/10 dark:hover:bg-white/10 ${
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
      </div>
      <ProfileMenu onSelect={onAddGroup} title={t('terminal.newGroup')} />
    </div>
  );
}
