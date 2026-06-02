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

/** Which runtime hosts the sidecar (mirrors the Rust `RuntimeKind`). */
export type RuntimeKind = 'native' | 'wsl';

/** Persisted runtime-mode settings (mirrors the Rust `RuntimeConfig`). */
export interface RuntimeConfig {
  /** Runtime mode. `native` (default) runs the bundled host binary; `wsl` runs
   *  it inside a distro (Windows-only, opt-in). */
  mode: RuntimeKind;
  /** Distro the sidecar runs in (registration name); required when `mode==='wsl'`. */
  distro?: string;
  /** Advanced override for the serve command. */
  serveCmdOverride?: string;
  /** Loopback port the sidecar binds. */
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
  /** Which runtime is being driven (`native` | `wsl`); absent when `disabled`. */
  runtime?: RuntimeKind;
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

/** Read the persisted runtime-mode settings. */
export async function getRuntimeConfig(): Promise<Result<RuntimeConfig>> {
  if (!isTauri()) return notInTauri();
  try {
    return ok(await invoke<RuntimeConfig>('get_runtime_config'));
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Persist runtime-mode settings and (re)drive the supervisor (runtime mutex:
 *  switching reaps the current runtime's sidecar before starting the next). */
export async function setRuntimeConfig(config: RuntimeConfig): Promise<Result<void>> {
  if (!isTauri()) return notInTauri();
  try {
    await invoke('set_runtime_config', { config });
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
