import { useEffect, useRef, type Dispatch } from 'react';
import {
  registerAction,
  registerState,
  republishCatalog,
  ToolError,
} from '../../agent';
import type { ProfileId } from '../../ipc';
import type { Workspace, WorkspaceAction } from './workspaceReducer';

/**
 * Register the first real semantic agent tools, bound to the terminal-workspace
 * reducer (task 2.6). Tabs are the workspace *groups*; because their ids are
 * `crypto.randomUUID()` the agent addresses them by **index** and reads their
 * **label**, never the raw id.
 *
 * Tools:
 *   - `open_tab`   (action): create a new terminal tab for a launch profile.
 *   - `focus_tab`  (action): activate an existing tab by index.
 *   - `get_open_tabs` (reader): list tabs as `{index, label, active}`.
 *   - `get_button_state` (reader): a button's `{disabled, visible, label}` by
 *     `data-testid` — the semantic shape from the ui-control-surface spec.
 *
 * Registration happens once on mount; handlers read live state/dispatch through
 * refs so a reader always observes the current snapshot. On unmount we
 * unregister and re-publish so the agent's tool surface tracks the live UI.
 */

const VALID_PROFILES: ProfileId[] = [
  'terminal',
  'claude-opus',
  'claude-glm',
  'codex',
];

interface OpenTabInput {
  profileId?: unknown;
}
interface FocusTabInput {
  index?: unknown;
}
interface ButtonStateInput {
  testId?: unknown;
}

export function useAgentTabTools(
  state: Workspace,
  dispatch: Dispatch<WorkspaceAction>,
): void {
  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const unregisters = [
      registerAction(
        {
          name: 'open_tab',
          description:
            'Open a new terminal tab running the given launch profile. ' +
            `Valid profileId values: ${VALID_PROFILES.join(', ')}.`,
          inputSchema: {
            type: 'object',
            properties: { profileId: { type: 'string', enum: VALID_PROFILES } },
            required: ['profileId'],
          },
          outputSchema: { type: 'null' },
        },
        (input) => {
          const profileId = (input as OpenTabInput)?.profileId;
          if (
            typeof profileId !== 'string' ||
            !VALID_PROFILES.includes(profileId as ProfileId)
          ) {
            throw new ToolError(
              'validation',
              `unknown profileId; expected one of ${VALID_PROFILES.join(', ')}`,
            );
          }
          dispatchRef.current({ type: 'addGroup', profileId: profileId as ProfileId });
          return null;
        },
      ),
      registerAction(
        {
          name: 'focus_tab',
          description:
            'Activate (bring to front) an existing terminal tab by its ' +
            'zero-based index, as listed by get_open_tabs.',
          inputSchema: {
            type: 'object',
            properties: { index: { type: 'integer', minimum: 0 } },
            required: ['index'],
          },
          outputSchema: { type: 'null' },
        },
        (input) => {
          const index = (input as FocusTabInput)?.index;
          const { groups } = stateRef.current;
          if (typeof index !== 'number' || !Number.isInteger(index)) {
            throw new ToolError('validation', 'index must be an integer');
          }
          const group = groups[index];
          if (!group) {
            throw new ToolError('not_found', `no tab at index ${index}`);
          }
          dispatchRef.current({ type: 'activateGroup', groupId: group.id });
          return null;
        },
      ),
      registerState(
        {
          name: 'get_open_tabs',
          description:
            'List the open terminal tabs as {index, label, active}. The active ' +
            'tab is the one currently shown.',
          inputSchema: { type: 'object', properties: {} },
          outputSchema: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                label: { type: 'string' },
                active: { type: 'boolean' },
              },
              required: ['index', 'label', 'active'],
            },
          },
        },
        () => {
          const { groups, activeGroupId } = stateRef.current;
          return groups.map((g, index) => ({
            index,
            label: g.label,
            active: g.id === activeGroupId,
          }));
        },
      ),
      registerState(
        {
          name: 'get_button_state',
          description:
            "Read a button's state by its data-testid: whether it is disabled, " +
            'visible, and its label text. Side-effect-free.',
          inputSchema: {
            type: 'object',
            properties: { testId: { type: 'string' } },
            required: ['testId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              disabled: { type: 'boolean' },
              visible: { type: 'boolean' },
              label: { type: 'string' },
            },
            required: ['disabled', 'visible', 'label'],
          },
        },
        (input) => {
          const testId = (input as ButtonStateInput)?.testId;
          if (typeof testId !== 'string' || testId.length === 0) {
            throw new ToolError('validation', 'get_button_state requires a testId');
          }
          const el = document.querySelector<HTMLElement>(
            `[data-testid="${CSS.escape(testId)}"]`,
          );
          if (!el) {
            throw new ToolError('not_found', `no element with data-testid="${testId}"`);
          }
          return {
            disabled:
              (el as HTMLButtonElement).disabled ??
              el.getAttribute('aria-disabled') === 'true',
            visible: el.offsetParent !== null,
            label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
          };
        },
      ),
    ];

    void republishCatalog();
    return () => {
      unregisters.forEach((unregister) => unregister());
      void republishCatalog();
    };
    // Register once for the lifetime of the workspace; live data flows through
    // the refs above. The label set is static, so no deps.
  }, []);
}
