import { useEffect, useRef, type Dispatch } from 'react';
import {
  registerAction,
  registerState,
  republishCatalog,
  ToolError,
} from '../../agent';
import type { ProfileId } from '../../ipc';
import { PROFILE_LABELS } from './profiles';
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
            `Valid \`profileId\` values: \`${VALID_PROFILES.join('`, `')}\`.`,
          inputSchema: {
            type: 'object',
            properties: {
              profileId: {
                type: 'string',
                enum: VALID_PROFILES,
                description: 'The launch profile to open. Must be one of the predefined profile IDs.',
              },
            },
            required: ['profileId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              opened: { type: 'boolean', description: 'Whether the tab was successfully opened.' },
              index: { type: 'integer', description: 'Zero-based index of the newly opened tab.' },
              label: { type: 'string', description: 'Display label of the newly opened tab.' },
              profileId: { type: 'string', description: 'The launch profile that was used.' },
            },
            required: ['opened', 'index', 'label', 'profileId'],
          },
        },
        (input) => {
          const profileId = (input as OpenTabInput)?.profileId;
          if (
            typeof profileId !== 'string' ||
            !VALID_PROFILES.includes(profileId as ProfileId)
          ) {
            throw new ToolError(
              'validation',
              `unknown profileId "${String(profileId)}"; valid values: ${VALID_PROFILES.join(', ')}`,
            );
          }
          const { groups } = stateRef.current;
          const newIndex = groups.length;
          dispatchRef.current({ type: 'addGroup', profileId: profileId as ProfileId });
          return {
            opened: true,
            index: newIndex,
            label: PROFILE_LABELS[profileId as ProfileId],
            profileId,
          };
        },
      ),
      registerAction(
        {
          name: 'focus_tab',
          description:
            'Activate (bring to front) an existing terminal tab by its ' +
            'zero-based `index`, as listed by `get_open_tabs`.',
          inputSchema: {
            type: 'object',
            properties: {
              index: {
                type: 'integer',
                minimum: 0,
                description: 'Zero-based position of the tab to activate, as returned by get_open_tabs.',
              },
            },
            required: ['index'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              focused: { type: 'boolean', description: 'Whether the tab was successfully focused.' },
              index: { type: 'integer', description: 'The index of the focused tab.' },
              label: { type: 'string', description: 'The label of the focused tab.' },
            },
            required: ['focused', 'index', 'label'],
          },
        },
        (input) => {
          const index = (input as FocusTabInput)?.index;
          const { groups } = stateRef.current;
          if (typeof index !== 'number' || !Number.isInteger(index)) {
            throw new ToolError('validation', 'index must be an integer');
          }
          const group = groups[index];
          if (!group) {
            throw new ToolError(
              'not_found',
              `no tab at index ${index}; currently ${groups.length} tab(s) open (indices 0–${groups.length - 1}). Call get_open_tabs for the full list.`,
            );
          }
          dispatchRef.current({ type: 'activateGroup', groupId: group.id });
          return { focused: true, index, label: group.label };
        },
      ),
      registerState(
        {
          name: 'get_open_tabs',
          description:
            'List the open terminal tabs as `{index, label, active}`. The active ' +
            'tab is the one currently shown.',
          inputSchema: { type: 'object', properties: {} },
          outputSchema: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer', description: 'Zero-based position of the tab in the tab bar.' },
                label: { type: 'string', description: 'Display label of the tab.' },
                active: { type: 'boolean', description: 'Whether this is the currently shown tab.' },
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
            "Read a button's state by its `data-testid`: whether it is disabled, " +
            'visible, and its label text. Side-effect-free.',
          inputSchema: {
            type: 'object',
            properties: {
              testId: {
                type: 'string',
                description: 'The data-testid attribute value of the button to inspect.',
              },
            },
            required: ['testId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              disabled: { type: 'boolean', description: 'Whether the button is disabled.' },
              visible: { type: 'boolean', description: 'Whether the button is laid out and non-empty.' },
              label: { type: 'string', description: 'The button\'s accessible label text.' },
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
