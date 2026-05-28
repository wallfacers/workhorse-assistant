import type { ProfileId } from '../../ipc';
import { PROFILE_LABELS } from './profiles';

// ---------------------------------------------------------------------------
// Split-tree types (design D1)
// ---------------------------------------------------------------------------

export interface PaneNode {
  kind: 'pane';
  id: string;
  profileId: ProfileId;
}

export interface SplitNode {
  kind: 'split';
  id: string;
  direction: 'row' | 'column';
  children: [LayoutNode, LayoutNode];
}

export type LayoutNode = SplitNode | PaneNode;

export interface Group {
  id: string;
  /** Fixed at creation from the creation profile; never changes. */
  label: string;
  layout: LayoutNode;
  activePaneId: string;
}

export interface Workspace {
  groups: Group[];
  /** `''` when no groups remain (empty state, design D6). */
  activeGroupId: string;
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

/** Return the first leaf (in-order) of a subtree. */
export function firstLeaf(node: LayoutNode): PaneNode {
  if (node.kind === 'pane') return node;
  return firstLeaf(node.children[0]);
}

/** Count leaf (pane) nodes in a subtree. Replaces `Group.panes.length`. */
export function countLeaves(node: LayoutNode): number {
  if (node.kind === 'pane') return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

/** All leaf panes of a subtree, left-to-right (in-order). */
export function flattenLeaves(node: LayoutNode): PaneNode[] {
  if (node.kind === 'pane') return [node];
  return [...flattenLeaves(node.children[0]), ...flattenLeaves(node.children[1])];
}

/** Find a PaneNode by id inside a subtree. */
function findPane(node: LayoutNode, id: string): PaneNode | null {
  if (node.kind === 'pane') return node.id === id ? node : null;
  return findPane(node.children[0], id) ?? findPane(node.children[1], id);
}

/**
 * Pure replace: return a new tree with the node whose `id` matches `targetId`
 * replaced by `replacement`. Returns the original tree if not found.
 */
function replaceNode(
  tree: LayoutNode,
  targetId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (tree.id === targetId) return replacement;
  if (tree.kind === 'pane') return tree;
  return {
    ...tree,
    children: [
      replaceNode(tree.children[0], targetId, replacement),
      replaceNode(tree.children[1], targetId, replacement),
    ],
  };
}

/**
 * For `closePane`: remove the leaf at `targetId`. Its parent `SplitNode`
 * collapses — the surviving sibling is promoted into the parent's slot.
 * Returns the new root and the surviving sibling subtree (for active-pane
 * reassignment), or `null` if the target was not found.
 */
function removeLeaf(
  tree: LayoutNode,
  targetId: string,
): { root: LayoutNode; survivor: LayoutNode } | null {
  if (tree.kind === 'pane') {
    // Caller guards against "last pane" with countLeaves <= 1 check.
    // If we somehow reach here for a non-matching leaf, it means the target
    // doesn't exist in this subtree.
    return null;
  }

  const [left, right] = tree.children;

  // Left child is the target leaf → promote right sibling.
  if (left.kind === 'pane' && left.id === targetId) {
    return { root: right, survivor: right };
  }
  // Right child is the target leaf → promote left sibling.
  if (right.kind === 'pane' && right.id === targetId) {
    return { root: left, survivor: left };
  }

  // Recurse into whichever side contains the target.
  const inLeft =
    left.kind === 'pane'
      ? left.id === targetId
      : !!findPane(left, targetId);

  if (inLeft) {
    const result = removeLeaf(left, targetId);
    if (!result) return null;
    // Always restructure: replace the left child with the result root,
    // keeping the right sibling intact.
    return {
      root: { ...tree, children: [result.root, right] },
      survivor: result.survivor,
    };
  }

  const result = removeLeaf(right, targetId);
  if (!result) return null;
  // Always restructure: replace the right child with the result root,
  // keeping the left sibling intact.
  return {
    root: { ...tree, children: [left, result.root] },
    survivor: result.survivor,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type WorkspaceAction =
  | { type: 'addGroup'; profileId: ProfileId }
  | { type: 'closeGroup'; groupId: string }
  | { type: 'activateGroup'; groupId: string }
  | { type: 'splitPane'; groupId: string; paneId: string; direction: 'row' | 'column' }
  | { type: 'closePane'; groupId: string; paneId: string }
  | { type: 'activatePane'; groupId: string; paneId: string };

function createPane(profileId: ProfileId): PaneNode {
  return { kind: 'pane', id: crypto.randomUUID(), profileId };
}

function createGroup(profileId: ProfileId): Group {
  const pane = createPane(profileId);
  return {
    id: crypto.randomUUID(),
    label: PROFILE_LABELS[profileId],
    layout: pane,
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
        const next = groups[idx] ?? groups[idx - 1];
        activeGroupId = next ? next.id : '';
      }
      return { groups, activeGroupId };
    }

    case 'splitPane': {
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.id !== action.groupId) return g;
          const target = findPane(g.layout, action.paneId);
          if (!target) return g;
          const newPane = createPane(target.profileId);
          const splitNode: SplitNode = {
            kind: 'split',
            id: crypto.randomUUID(),
            direction: action.direction,
            children: [target, newPane],
          };
          return {
            ...g,
            layout: replaceNode(g.layout, action.paneId, splitNode),
            activePaneId: newPane.id,
          };
        }),
      };
    }

    case 'closePane': {
      const group = state.groups.find((g) => g.id === action.groupId);
      if (!group) return state;
      // Last pane → close the group.
      if (countLeaves(group.layout) <= 1) {
        return workspaceReducer(state, {
          type: 'closeGroup',
          groupId: action.groupId,
        });
      }
      const result = removeLeaf(group.layout, action.paneId);
      if (!result) return state;
      // Reassign focus: first leaf of the surviving subtree.
      const activePaneId =
        action.paneId === group.activePaneId
          ? firstLeaf(result.survivor).id
          : group.activePaneId;
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.groupId
            ? { ...g, layout: result.root, activePaneId }
            : g,
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
