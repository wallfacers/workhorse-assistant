/**
 * Typed wrappers for the permission-rule IPC surface.
 *
 * The renderer never talks to the sidecar directly: these proxy to Rust
 * commands that call the agent's `/v1/permissions` (read effective rules) and
 * `/v1/permission-config` (read/write the config.yaml source of truth).
 */
import { invoke } from '@tauri-apps/api/core';

import { isTauri } from './runtime';
import { ok, toIpcError, type Result } from './result';

/** The two decisions a permanent rule can carry. */
export type PermanentDecision = 'allow_permanent' | 'deny_permanent';

/** The default fallback policy; `''` means "prompt every time". */
export type DefaultPermission = '' | 'allow_permanent' | 'deny_permanent';

/** Where a rule came from: a config preset or a manually-created API rule. */
export type PermissionSource = 'preset' | 'manual';

/** A permanent rule as currently enforced by the agent (`GET /v1/permissions`). */
export interface PermissionRule {
  id: string;
  session_id: string;
  tool: string;
  pattern: string;
  decision: PermanentDecision;
  scope: string;
  source: PermissionSource;
  created_at: string;
}

/** A preset rule as stored in config.yaml's `tools.preset_rules`. */
export interface PresetRule {
  tool: string;
  pattern: string;
  decision: PermanentDecision;
}

/** The permission subset of config.yaml (the editable source of truth). */
export interface PermissionConfig {
  default_permission: DefaultPermission;
  preset_rules: PresetRule[];
}

const notInTauri = () =>
  ({
    ok: false,
    error: { kind: 'validation', message: 'permission bridge invoked outside Tauri runtime' },
  }) as const;

/** List the permanent rules the agent is currently enforcing. */
export async function listPermissions(): Promise<Result<PermissionRule[]>> {
  if (!isTauri()) return notInTauri();
  try {
    const body = await invoke<{ rules?: PermissionRule[] }>('agent_list_permissions');
    return ok(body.rules ?? []);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Read the permission subset of config.yaml (the editable source of truth). */
export async function getPermissionConfig(): Promise<Result<PermissionConfig>> {
  if (!isTauri()) return notInTauri();
  try {
    const body = await invoke<PermissionConfig>('agent_get_permission_config');
    return ok({
      default_permission: body.default_permission ?? '',
      preset_rules: body.preset_rules ?? [],
    });
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/**
 * Write the permission subset back to config.yaml. The agent preserves comments
 * and hot-reloads the change; the returned config reflects what was written.
 */
export async function setPermissionConfig(
  config: PermissionConfig,
): Promise<Result<PermissionConfig>> {
  if (!isTauri()) return notInTauri();
  try {
    const body = await invoke<PermissionConfig>('agent_set_permission_config', { config });
    return ok({
      default_permission: body.default_permission ?? '',
      preset_rules: body.preset_rules ?? [],
    });
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}
