import { useReducer } from 'react';
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
            <ProfileMenu variant="tab" label="新建终端" onSelect={addGroup} />
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
                onAddPane={(profileId) =>
                  dispatch({ type: 'addPane', groupId: g.id, profileId })
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
