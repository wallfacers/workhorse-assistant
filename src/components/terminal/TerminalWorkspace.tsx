import { useCallback, useEffect, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileId } from '../../ipc';
import {
  initWorkspace,
  workspaceReducer,
} from './workspaceReducer';
import TabBar from './TabBar';
import TerminalGroup from './TerminalGroup';
import FileEditor from '../editor/FileEditor';
import ProfileMenu from './ProfileMenu';
import { useAgentTabTools } from './useAgentTabTools';
import { useAgentProjectTools } from './useAgentProjectTools';
import { useShortcut } from '../../shortcuts';
import { useConfirm } from '../ConfirmProvider';

/**
 * The center-pane workspace (design D1/D3). Holds the whole reducer tree and
 * composes the S0 `Terminal` leaves. Inactive groups stay **mounted** — they
 * are taken out of the paint tree with `display:none` so their agents keep
 * running while idle xterm canvases stop compositing; only mount/unmount
 * (create/close) ever ends a PTY — never a tab switch.
 * Adds no Rust and no IPC.
 */
interface TerminalWorkspaceProps {
  /** A file path pushed by the parent (RightPanel file click). Consumed once. */
  pendingFile?: string | null;
  /** Called after pendingFile has been dispatched to the reducer. */
  onFileConsumed?: () => void;
}

export default function TerminalWorkspace({ pendingFile, onFileConsumed }: TerminalWorkspaceProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [state, dispatch] = useReducer(workspaceReducer, undefined, initWorkspace);
  const [titles, setTitles] = useState<Record<string, string>>({});

  // Expose tab open/focus and tab-list reads to the agent (task 2.6).
  useAgentTabTools(state, dispatch);
  // Expose project navigation tools (get_current_project, open_project).
  useAgentProjectTools();
  const addGroup = (profileId: ProfileId) =>
    dispatch({ type: 'addGroup', profileId });

  // Centralized keyboard shortcuts (replaces Alt+Shift+= / Alt+Shift+-).
  useShortcut('newTerminal', () => addGroup('terminal'), [addGroup]);

  useShortcut(
    'splitTerminal',
    () => {
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
    },
    [state.groups, state.activeGroupId],
  );

  useShortcut(
    'closePanel',
    () => {
      const group = state.groups.find((g) => g.id === state.activeGroupId);
      if (!group) return;
      dispatch({
        type: 'closePane',
        groupId: group.id,
        paneId: group.activePaneId,
      });
    },
    [state.groups, state.activeGroupId],
  );

  // Consume external file-open requests (from RightPanel file tree).
  useEffect(() => {
    if (pendingFile) {
      dispatch({ type: 'addEditorGroup', filePath: pendingFile });
      onFileConsumed?.();
    }
  }, [pendingFile, onFileConsumed]);

  const handlePaneTitle = useCallback(
    (paneId: string, title: string) => {
      setTitles((prev) => prev[paneId] === title ? prev : { ...prev, [paneId]: title });
    },
    [],
  );

  const groupTitles = state.groups.map((g) => {
    if (g.kind === 'editor' && g.filePath) {
      return g.filePath.split(/[/\\]/).pop() ?? g.filePath;
    }
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
        onClose={(id) => {
          // Guard: if the group is an editor with unsaved changes, confirm first.
          const g = state.groups.find((g) => g.id === id);
          if (g?.kind === 'editor' && g.isDirty) {
            void confirm({
              title: t('editor.unsavedTitle'),
              body: t('editor.unsavedBody', { file: g.filePath?.split(/[/\\]/).pop() ?? '' }),
              danger: true,
            }).then((ok) => {
              if (ok) dispatch({ type: 'closeGroup', groupId: id });
            });
            return;
          }
          dispatch({ type: 'closeGroup', groupId: id });
        }}
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
              {g.kind === 'editor' ? (
                // Wrap the editor in the same inset rounded card as the terminal
                // panes (PaneCard: inset-1 + rounded-lg + border) so the file
                // editor reads as a panel with a matching corner radius.
                <div className="absolute inset-1 flex flex-col overflow-hidden rounded-lg border border-outline bg-surface dark:border-outline-dark dark:bg-surface-dark-elevated">
                  <FileEditor
                    filePath={g.filePath ?? ''}
                    isDirty={g.isDirty ?? false}
                    onDirtyChange={(dirty) => dispatch({ type: 'setGroupDirty', groupId: g.id, isDirty: dirty })}
                  />
                </div>
              ) : (
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
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
