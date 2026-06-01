import { useEffect, useRef } from 'react';
import {
  registerAction,
  registerState,
  republishCatalog,
  ToolError,
} from '../../agent';
import { fsList } from '../../ipc';
import { useSession } from '../../session/SessionProvider';
import i18n from '../../i18n';

/**
 * Register agent tools for project navigation:
 *   - `get_current_project` (reader): returns the current project path, label,
 *     and recently-opened paths. Side-effect-free; reads live session state.
 *   - `open_project` (action): re-attaches the session to a different project
 *     workdir. Direct mode (default) validates the path and switches; confirm
 *     mode opens the existing picker for user confirmation.
 *
 * Registration happens once on mount; handlers read live state through refs so
 * a reader always observes the current snapshot. On unmount we unregister and
 * re-publish so the agent's tool surface tracks the live UI.
 */

/** Derive a display label from a path (mirrors TitleBar's logic). */
function pathLabel(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

// ---------------------------------------------------------------------------
// Input types (unknown is required by the registry contract; cast inside)
// ---------------------------------------------------------------------------

interface OpenProjectInput {
  path?: unknown;
  confirm?: unknown;
}

export function useAgentProjectTools(): void {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const unregisters = [
      // -----------------------------------------------------------------------
      // get_current_project — reader
      // -----------------------------------------------------------------------
      registerState(
        {
          name: 'get_current_project',
          description:
            'Read the current project workdir path, its display label, and ' +
            'the list of recently-opened project paths. Side-effect-free — ' +
            'use before `open_project` to avoid re-opening the current project.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          outputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'The current project workdir path. Empty string when no project is selected.',
              },
              label: {
                type: 'string',
                description: 'Display label (basename) of the current project.',
              },
              recentPaths: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Recently-opened project paths, most-recent-first. May be empty.',
              },
            },
            required: ['path', 'label', 'recentPaths'],
          },
        },
        () => {
          const { currentProject, recentProjects } = sessionRef.current;
          return {
            path: currentProject ?? '',
            label: currentProject ? pathLabel(currentProject) : '',
            recentPaths: recentProjects ?? [],
          };
        },
      ),

      // -----------------------------------------------------------------------
      // open_project — action (parallel-unsafe)
      // -----------------------------------------------------------------------
      registerAction(
        {
          name: 'open_project',
          description:
            'Switch the session to a different project workdir. ' +
            'By default (`confirm` unset or false) the tool validates the path ' +
            'and switches directly. Set `confirm: true` to open the existing ' +
            'folder picker pre-navigated to the candidate path so the user can ' +
            'confirm or edit before switching.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'The absolute project directory path to switch to (sidecar namespace).',
              },
              confirm: {
                type: 'boolean',
                description:
                  'When true, open the folder picker for user confirmation instead of switching directly. Default: false.',
              },
            },
            required: ['path'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              opened: {
                type: 'boolean',
                description: 'Whether the project was successfully opened.',
              },
              path: {
                type: 'string',
                description: 'The resolved project path (may differ from input when the user edits in the picker).',
              },
              label: {
                type: 'string',
                description: 'Display label (basename) of the opened project.',
              },
              cancelled: {
                type: 'boolean',
                description: 'True when the user dismissed the confirmation picker without choosing.',
              },
            },
            required: ['opened'],
          },
        },
        async (input) => {
          const { path: rawPath, confirm } = (input ?? {}) as OpenProjectInput;

          if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
            throw new ToolError(
              'validation',
              '`path` must be a non-empty string specifying the project directory to open.',
            );
          }
          const targetPath = rawPath.trim();
          const { openProject, currentProject, requestPicker } =
            sessionRef.current;

          // Idempotent: already on this project.
          if (targetPath === currentProject) {
            return { opened: true, path: currentProject, label: pathLabel(currentProject) };
          }

          // --- Confirm mode: delegate to the picker UI -----------------------
          if (confirm) {
            let picked: string | null;
            try {
              picked = await requestPicker(targetPath);
            } catch {
              // D3: another confirm picker is already open. Surface a clear,
              // retryable error to the model rather than a bare `internal`.
              throw new ToolError('transient', i18n.t('project.pickerAlreadyOpen'));
            }
            if (picked === null) {
              return { opened: false, cancelled: true };
            }
            await openProject(picked);
            return { opened: true, path: picked, label: pathLabel(picked) };
          }

          // --- Direct mode: validate via fsList, then open -------------------
          const res = await fsList(targetPath);
          if (!res.ok) {
            // Try the parent for a helpful suggestion.
            const parent = targetPath.replace(/[/\\]+$/, '');
            const sep = Math.max(parent.lastIndexOf('/'), parent.lastIndexOf('\\'));
            const suggestion =
              sep > 0 ? `Did you mean "${parent.slice(0, sep)}"?` : '';
            throw new ToolError(
              'not_found',
              `Path "${targetPath}" does not resolve to a directory. ${suggestion} Use \`get_current_project\` to list recent paths.`.trim(),
            );
          }

          await openProject(targetPath);
          return {
            opened: true,
            path: targetPath,
            label: pathLabel(targetPath),
          };
        },
      ),
    ];

    void republishCatalog();
    return () => {
      unregisters.forEach((unregister) => unregister());
      void republishCatalog();
    };
  }, []);
}
