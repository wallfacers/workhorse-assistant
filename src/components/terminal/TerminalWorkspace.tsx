import { useCallback, useEffect, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileId } from '../../ipc';
import {
  initWorkspace,
  workspaceReducer,
} from './workspaceReducer';
import TabBar from './TabBar';
import TerminalGroup from './TerminalGroup';
import ProfileMenu from './ProfileMenu';
import { useAgentTabTools } from './useAgentTabTools';
import { useAgentProjectTools } from './useAgentProjectTools';

/**
 * The center-pane workspace (design D1/D3). Holds the whole reducer tree and
 * composes the S0 `Terminal` leaves. Inactive groups stay **mounted** — they
 * are taken out of the paint tree with `display:none` so their agents keep
 * running while idle xterm canvases stop compositing; only mount/unmount
 * (create/close) ever ends a PTY — never a tab switch.
 * Adds no Rust and no IPC.
 */
export default function TerminalWorkspace() {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(workspaceReducer, undefined, initWorkspace);
  const [titles, setTitles] = useState<Record<string, string>>({});

  // Expose tab open/focus and tab-list reads to the agent (task 2.6).
  useAgentTabTools(state, dispatch);
  // Expose project navigation tools (get_current_project, open_project).
  useAgentProjectTools();
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

  const handlePaneTitle = useCallback(
    (paneId: string, title: string) => {
      setTitles((prev) => prev[paneId] === title ? prev : { ...prev, [paneId]: title });
    },
    [],
  );

  const groupTitles = state.groups.map((g) => {
    const activeTitle = titles[g.activePaneId];
    return activeTitle ?? g.label;
  });

  return (
    <div className="flex flex-col h-full w-full min-h-0 overflow-hidden">
      <TabBar
        groups={state.groups}
        groupTitles={groupTitles}
        activeGroupId={state.activeGroupId}
        onActivate={(id) => dispatch({ type: 'activateGroup', groupId: id })}
        onClose={(id) => dispatch({ type: 'closeGroup', groupId: id })}
        onAddGroup={addGroup}
      />

      <div className="relative flex-1 min-h-0">
        {state.groups.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-on-surface-muted dark:text-on-canvas-dark-muted">
            <p className="text-[13px]">{t('terminal.noTerminal')}</p>
            <ProfileMenu label={t('terminal.newTerminal')} onSelect={addGroup} />
          </div>
        ) : (
          state.groups.map((g) => {
            const isActive = g.id === state.activeGroupId;
            return (
            <div
              key={g.id}
              className="absolute inset-0"
              style={{
                display: isActive ? undefined : 'none',
                pointerEvents: isActive ? 'auto' : 'none',
              }}
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
                onPaneTitle={handlePaneTitle}
              />
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
