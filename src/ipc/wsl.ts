import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ok, toIpcError, type Result } from './result';
import { isTauri } from './runtime';

/** Result of WSL host/distro detection (`wsl_detect`). */
export interface WslDetect {
  /** Whether the assistant's own host process runs on Windows. */
  hostIsWindows: boolean;
  /** True when the host is Windows AND at least one distro is installed. */
  available: boolean;
  /** WSL distro registration names (`wsl -l -q`), in listed order. */
  distros: string[];
}

/** Persisted managed-sidecar settings (mirrors the Rust `WslConfig`). */
export interface WslManagedConfig {
  /** The managed-sidecar toggle. */
  managed: boolean;
  /** Distro the sidecar runs in (registration name). */
  distro?: string;
  /** Advanced override for the in-distro command after `exec `. */
  serveCmdOverride?: string;
  /** Loopback port the sidecar binds inside the distro. */
  port: number;
}

/** Supervisor lifecycle state, surfaced for the Settings status badge. */
export type SupervisorState =
  | 'disabled'
  | 'probing'
  | 'adopted'
  | 'starting'
  | 'healthy'
  | 'restarting'
  | 'failed';

export interface SupervisorStatus {
  state: SupervisorState;
  /** Human-readable reason, present on `failed` (and optionally elsewhere). */
  reason?: string;
}

const notInTauri = () =>
  ({ ok: false, error: { kind: 'validation', message: 'wsl bridge invoked outside Tauri runtime' } }) as const;

/** Detect WSL availability for the managed-sidecar Settings UI. */
export async function wslDetect(): Promise<Result<WslDetect>> {
  if (!isTauri()) return notInTauri();
  try {
    return ok(await invoke<WslDetect>('wsl_detect'));
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Read the persisted managed-sidecar settings. */
export async function getManagedConfig(): Promise<Result<WslManagedConfig>> {
  if (!isTauri()) return notInTauri();
  try {
    return ok(await invoke<WslManagedConfig>('get_managed_config'));
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Persist managed-sidecar settings and (re)drive the supervisor. */
export async function setManagedConfig(config: WslManagedConfig): Promise<Result<void>> {
  if (!isTauri()) return notInTauri();
  try {
    await invoke('set_managed_config', { config });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Current supervisor status (one-shot read; live updates via {@link onSupervisorStatus}). */
export async function supervisorStatus(): Promise<Result<SupervisorStatus>> {
  if (!isTauri()) return notInTauri();
  try {
    return ok(await invoke<SupervisorStatus>('supervisor_status'));
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Subscribe to supervisor state transitions (`supervisor://status`). */
export async function onSupervisorStatus(
  handler: (status: SupervisorStatus) => void,
): Promise<UnlistenFn> {
  return listen<SupervisorStatus>('supervisor://status', (event) => handler(event.payload));
}
