import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  registerAction,
  executeAction,
  actionCatalog,
  __resetActions,
} from '../../agent/actionRegistry';
import {
  registerState,
  executeState,
  stateCatalog,
  __resetStates,
} from '../../agent/stateRegistry';
import { ToolError } from '../../agent/contract';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ipc/agent', () => ({
  fsList: vi.fn((path?: string) => {
    if (path === '/valid-project' || path === '/home/user/my-app') {
      return Promise.resolve({ ok: true, value: { path, entries: [] } });
    }
    return Promise.resolve({
      ok: false,
      error: { kind: 'not_found', message: `Path "${path}" not found` },
    });
  }),
}));

// Import the mocked fsList so the handler can use it.
import { fsList } from '../../ipc/agent';

// Mock session data — the handlers read through a mutable ref.
const mockSession = {
  currentProject: '/home/user/current',
  recentProjects: ['/home/user/current', '/home/user/other'],
  openProject: vi.fn((_path: string) => Promise.resolve()),
  requestPicker: vi.fn((_path: string): Promise<string | null> => Promise.resolve(null)),
};

// ---------------------------------------------------------------------------
// Helper: register tools (mirrors useAgentProjectTools)
// ---------------------------------------------------------------------------

function pathLabel(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

function registerProjectTools(session: typeof mockSession) {
  const sessionRef = { current: session };

  return [
    registerState(
      {
        name: 'get_current_project',
        description: 'Read the current project.',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            label: { type: 'string' },
            recentPaths: { type: 'array', items: { type: 'string' } },
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
    registerAction(
      {
        name: 'open_project',
        description: 'Switch project.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            confirm: { type: 'boolean' },
          },
          required: ['path'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            opened: { type: 'boolean' },
            path: { type: 'string' },
            label: { type: 'string' },
            cancelled: { type: 'boolean' },
          },
          required: ['opened'],
        },
      },
      async (input) => {
        const { path: rawPath, confirm } = (input ?? {}) as {
          path?: unknown;
          confirm?: unknown;
        };
        if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
          throw new ToolError(
            'validation',
            '`path` must be a non-empty string.',
          );
        }
        const targetPath = rawPath.trim();
        const { openProject, currentProject, requestPicker } =
          sessionRef.current;

        if (targetPath === currentProject) {
          return {
            opened: true,
            path: currentProject,
            label: pathLabel(currentProject),
          };
        }

        if (confirm) {
          // Mirrors the real hook: a throw from requestPicker (D3 "picker
          // already open") is mapped to a retryable `transient` ToolError. The
          // real hook localizes the message via i18n; the mirror uses a literal
          // to keep the test decoupled from the active language.
          let picked: string | null;
          try {
            picked = await requestPicker(targetPath);
          } catch {
            throw new ToolError('transient', 'Project picker is already open.');
          }
          if (picked === null) {
            return { opened: false, cancelled: true };
          }
          await openProject(picked);
          return { opened: true, path: picked, label: pathLabel(picked) };
        }

        const res = await fsList(targetPath);
        if (!res.ok) {
          throw new ToolError(
            'not_found',
            `Path "${targetPath}" not found.`,
          );
        }
        await openProject(targetPath);
        return { opened: true, path: targetPath, label: pathLabel(targetPath) };
      },
    ),
  ];
}

afterEach(() => {
  __resetActions();
  __resetStates();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A4: get_current_project reader
// ---------------------------------------------------------------------------

describe('get_current_project reader', () => {
  it('returns current project and recent paths', async () => {
    registerProjectTools(mockSession);
    const result = await executeState('get_current_project', {});
    expect(result).toEqual({
      ok: true,
      value: {
        path: '/home/user/current',
        label: 'current',
        recentPaths: ['/home/user/current', '/home/user/other'],
      },
    });
  });

  it('returns empty state without throwing', async () => {
    const emptySession = {
      currentProject: '',
      recentProjects: [] as string[],
      openProject: vi.fn(),
      requestPicker: vi.fn(),
    };
    registerProjectTools(emptySession);
    const result = await executeState('get_current_project', {});
    expect(result).toEqual({
      ok: true,
      value: { path: '', label: '', recentPaths: [] },
    });
  });
});

// ---------------------------------------------------------------------------
// B5: open_project — direct mode
// ---------------------------------------------------------------------------

describe('open_project action — direct mode', () => {
  it('valid path switches and returns confirmation', async () => {
    registerProjectTools(mockSession);
    const result = await executeAction('open_project', {
      path: '/valid-project',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        opened: true,
        path: '/valid-project',
        label: 'valid-project',
      });
    }
    expect(mockSession.openProject).toHaveBeenCalledWith('/valid-project');
  });

  it('bad path yields self-repairing error and no switch', async () => {
    registerProjectTools(mockSession);
    const result = await executeAction('open_project', {
      path: '/nonexistent',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
      expect(result.error.message).toContain('/nonexistent');
    }
    expect(mockSession.openProject).not.toHaveBeenCalled();
  });

  it('empty path returns validation error', async () => {
    registerProjectTools(mockSession);
    const result = await executeAction('open_project', { path: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('validation');
    }
  });

  it('missing path returns validation error', async () => {
    registerProjectTools(mockSession);
    const result = await executeAction('open_project', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('validation');
    }
  });

  it('same path is idempotent (no openProject call)', async () => {
    registerProjectTools(mockSession);
    const result = await executeAction('open_project', {
      path: '/home/user/current',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        opened: true,
        path: '/home/user/current',
      });
    }
    expect(mockSession.openProject).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D1/D2/D3: open_project — confirm mode
// ---------------------------------------------------------------------------

describe('open_project action — confirm mode', () => {
  it('user picks → returns opened with the picked path', async () => {
    mockSession.requestPicker.mockResolvedValueOnce('/home/user/picked');
    registerProjectTools(mockSession);
    const result = await executeAction('open_project', {
      path: '/some-path',
      confirm: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        opened: true,
        path: '/home/user/picked',
        label: 'picked',
      });
    }
    expect(mockSession.openProject).toHaveBeenCalledWith('/home/user/picked');
  });

  it('user cancels → returns cancelled', async () => {
    mockSession.requestPicker.mockResolvedValueOnce(null);
    registerProjectTools(mockSession);
    const result = await executeAction('open_project', {
      path: '/some-path',
      confirm: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ opened: false, cancelled: true });
    }
    expect(mockSession.openProject).not.toHaveBeenCalled();
  });

  it('picker already open → error envelope', async () => {
    mockSession.requestPicker.mockImplementationOnce(() => {
      throw new Error('Picker already open');
    });
    registerProjectTools(mockSession);
    const result = await executeAction('open_project', {
      path: '/some-path',
      confirm: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // D3: surfaced as a retryable `transient` error, not a bare `internal`.
      expect(result.error.kind).toBe('transient');
      expect(result.error.message).toContain('already open');
    }
    expect(mockSession.openProject).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Catalog checks
// ---------------------------------------------------------------------------

describe('project tools in catalog', () => {
  it('get_current_project is parallel-safe', () => {
    registerProjectTools(mockSession);
    const readers = stateCatalog();
    const reader = readers.find((e) => e.name === 'get_current_project');
    expect(reader).toBeDefined();
    expect(reader!.parallelSafety).toBe('safe');
  });

  it('open_project is parallel-unsafe', () => {
    registerProjectTools(mockSession);
    const actions = actionCatalog();
    const action = actions.find((e) => e.name === 'open_project');
    expect(action).toBeDefined();
    expect(action!.parallelSafety).toBe('unsafe');
  });
});
