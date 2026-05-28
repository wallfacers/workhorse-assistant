/**
 * IPC result envelope.
 *
 * Every typed wrapper in this directory MUST return a `Result<T>` rather
 * than throwing — components are not allowed to `try/catch` around
 * `invoke()` directly. The kind discriminator follows the error taxonomy
 * defined in docs/RELIABILITY.md.
 */

export type IpcErrorKind = 'validation' | 'not_found' | 'transient' | 'internal';

export interface IpcError {
  kind: IpcErrorKind;
  message: string;
  /** Optional structured payload for the renderer; never parse `message`. */
  details?: unknown;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: IpcError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (
  kind: IpcErrorKind,
  message: string,
  details?: unknown,
): Result<never> => ({ ok: false, error: { kind, message, details } });

/**
 * Convert an unknown thrown value (Tauri's `invoke` rejects with `string`
 * or a structured object) into an `IpcError`. Used by the wrappers in this
 * directory; do not call from components.
 */
export function toIpcError(thrown: unknown): IpcError {
  if (typeof thrown === 'string') {
    return { kind: 'internal', message: thrown };
  }
  if (
    thrown &&
    typeof thrown === 'object' &&
    'kind' in thrown &&
    'message' in thrown
  ) {
    const candidate = thrown as { kind: unknown; message: unknown; details?: unknown };
    if (
      typeof candidate.message === 'string' &&
      isIpcErrorKind(candidate.kind)
    ) {
      return {
        kind: candidate.kind,
        message: candidate.message,
        details: candidate.details,
      };
    }
  }
  return {
    kind: 'internal',
    message: 'Unknown IPC failure',
    details: thrown,
  };
}

function isIpcErrorKind(value: unknown): value is IpcErrorKind {
  return (
    value === 'validation' ||
    value === 'not_found' ||
    value === 'transient' ||
    value === 'internal'
  );
}
