import { invoke } from '@tauri-apps/api/core';
import { toIpcError, ok, err, type Result } from './result';

/** Mirrors `AppInfo` in src-tauri/src/lib.rs. */
export interface AppInfo {
  name: string;
  version: string;
}

export async function getAppInfo(): Promise<Result<AppInfo>> {
  try {
    const value = await invoke<AppInfo>('app_info');
    return ok(value);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

export async function greet(name: string): Promise<Result<string>> {
  if (!name.trim()) {
    return err('validation', 'name must not be empty');
  }
  try {
    const value = await invoke<string>('greet', { name });
    return ok(value);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}
