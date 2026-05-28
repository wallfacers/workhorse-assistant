import { useEffect, useReducer } from 'react';
import type { ProfileId } from '../../ipc';
import {
  initWorkspace,
  workspaceReducer,
} from './workspaceReducer';
import TabBar from './TabBar';
import TerminalGroup from './TerminalGroup';
import ProfileMenu from './ProfileMenu';

/**
 * The center-pane workspace (design D1/D3). Holds the whole reducer tree and
 * composes the S0 `Terminal` leaves. Inactive groups stay **mounted** and are
 * hidden with Tailwind's `hidden` class (`display:none`) so their agents keep
 * running; only mount/unmount (create/close) ever ends a PTY — never a tab
 * switch. Adds no Rust and no IPC.
 */
export default function TerminalWorkspace() {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, initWorkspace);
  const addGroup = (profileId: ProfileId) =>
    dispatch({ type: 'addGroup', profileId });

  // Keyboard shortcuts: Alt+Shift++ split, Alt+Shift+- close (design D4).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.altKey || !e.shiftKey) return;

      if (e.code === 'Equal') {
        e.preventDefault();
        // Find the active group and pane.
        const group = state.groups.find((g) => g.id === state.activeGroupId);
        if (!group) return;

        // Auto-pick direction from the active pane's longer edge.
        const el = document.querySelector(
          `[data-pane-id="${group.activePaneId}"]`,
        );
        let direction: 'row' | 'column' = 'row';
        if (el) {
          const rect = el.getBoundingClientRect();
          direction = rect.width >= rect.height ? 'row' : 'column';
        }

        dispatch({
          type: 'splitPane',
          groupId: group.id,
          paneId: group.activePaneId,
          direction,
        });
        return;
      }

      if (e.code === 'Minus') {
        e.preventDefault();
        const group = state.groups.find((g) => g.id === state.activeGroupId);
        if (!group) return;
        dispatch({
          type: 'closePane',
          groupId: group.id,
          paneId: group.activePaneId,
        });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.groups, state.activeGroupId]);

  return (
    <div className="flex flex-col h-full w-full min-h-0 rounded-lg border border-outline dark:border-neutral-800 bg-surface-muted dark:bg-surface-dark overflow-hidden">
      <TabBar
        groups={state.groups}
        activeGroupId={state.activeGroupId}
        onActivate={(id) => dispatch({ type: 'activateGroup', groupId: id })}
        onClose={(id) => dispatch({ type: 'closeGroup', groupId: id })}
        onAddGroup={addGroup}
      />

      <div className="relative flex-1 min-h-0">
        {state.groups.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
            <p className="text-[13px]">暂无终端</p>
            <ProfileMenu label="新建终端" onSelect={addGroup} />
          </div>
        ) : (
          state.groups.map((g) => (
            <div
              key={g.id}
              className={`absolute inset-0 ${
                g.id === state.activeGroupId ? '' : 'hidden'
              }`}
            >
              <TerminalGroup
                group={g}
                onSplitPane={(paneId, direction) =>
                  dispatch({ type: 'splitPane', groupId: g.id, paneId, direction })
                }
                onClosePane={(paneId) =>
                  dispatch({ type: 'closePane', groupId: g.id, paneId })
                }
                onActivatePane={(paneId) =>
                  dispatch({ type: 'activatePane', groupId: g.id, paneId })
                }
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
