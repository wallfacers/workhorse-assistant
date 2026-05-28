import type { ProfileId } from '../../ipc';
import { PROFILE_LABELS } from './profiles';

/**
 * Renderer-only workspace state (design D1). Ids are client-side
 * (`crypto.randomUUID()`) and used only as React keys / lookup keys — they are
 * NOT PTY session ids (those stay owned by each `Terminal` leaf).
 */

export interface Pane {
  id: string;
  profileId: ProfileId;
}

export interface Group {
  id: string;
  /** Fixed at creation from the creation profile; never changes (review B). */
  label: string;
  panes: Pane[];
  activePaneId: string;
}

export interface Workspace {
  groups: Group[];
  /** `''` when no groups remain (empty state, design D6). */
  activeGroupId: string;
}

export type WorkspaceAction =
  | { type: 'addGroup'; profileId: ProfileId }
  | { type: 'closeGroup'; groupId: string }
  | { type: 'activateGroup'; groupId: string }
  | { type: 'addPane'; groupId: string; profileId: ProfileId }
  | { type: 'closePane'; groupId: string; paneId: string }
  | { type: 'activatePane'; groupId: string; paneId: string };

function createPane(profileId: ProfileId): Pane {
  return { id: crypto.randomUUID(), profileId };
}

function createGroup(profileId: ProfileId): Group {
  const pane = createPane(profileId);
  return {
    id: crypto.randomUUID(),
    label: PROFILE_LABELS[profileId],
    panes: [pane],
    activePaneId: pane.id,
  };
}

/** Initial state: one group with one `shell` pane (parity with S0 default). */
export function initWorkspace(): Workspace {
  const group = createGroup('shell');
  return { groups: [group], activeGroupId: group.id };
}

export function workspaceReducer(
  state: Workspace,
  action: WorkspaceAction,
): Workspace {
  switch (action.type) {
    case 'addGroup': {
      const group = createGroup(action.profileId);
      return { groups: [...state.groups, group], activeGroupId: group.id };
    }

    case 'activateGroup': {
      if (!state.groups.some((g) => g.id === action.groupId)) return state;
      return { ...state, activeGroupId: action.groupId };
    }

    case 'closeGroup': {
      const idx = state.groups.findIndex((g) => g.id === action.groupId);
      if (idx === -1) return state;
      const groups = state.groups.filter((g) => g.id !== action.groupId);
      let { activeGroupId } = state;
      if (action.groupId === activeGroupId) {
        // Reassign to the right neighbour, else the left, else empty
        // (invariant: no dangling active id). After the filter, the element
        // that was at idx+1 now sits at idx.
        const next = groups[idx] ?? groups[idx - 1];
        activeGroupId = next ? next.id : '';
      }
      return { groups, activeGroupId };
    }

    case 'addPane': {
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.id !== action.groupId) return g;
          const pane = createPane(action.profileId);
          return { ...g, panes: [...g.panes, pane], activePaneId: pane.id };
        }),
      };
    }

    case 'closePane': {
      const group = state.groups.find((g) => g.id === action.groupId);
      if (!group) return state;
      const remaining = group.panes.filter((p) => p.id !== action.paneId);
      // Last pane → close the group (delegates the active-group reassignment).
      if (remaining.length === 0) {
        return workspaceReducer(state, {
          type: 'closeGroup',
          groupId: action.groupId,
        });
      }
      // Reassign focus to the first remaining pane if the active one closed.
      const activePaneId =
        action.paneId === group.activePaneId
          ? remaining[0].id
          : group.activePaneId;
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.groupId ? { ...g, panes: remaining, activePaneId } : g,
        ),
      };
    }

    case 'activatePane': {
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.groupId ? { ...g, activePaneId: action.paneId } : g,
        ),
      };
    }
  }
}
