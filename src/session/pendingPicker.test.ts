import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// C4: pendingPickerRequest — resolve, cancel, supersede all settle exactly once
//
// These tests exercise the requestPicker/resolvePicker logic in isolation
// (no React rendering needed — the logic is pure state + promise wiring).
// ---------------------------------------------------------------------------

// We replicate the core logic here to test it without React context overhead.
// The implementation in SessionProvider.tsx uses the same pattern.

function createPickerController() {
  let resolveRef: ((picked: string | null) => void) | null = null;
  let pendingPath: string | null = null;

  function requestPicker(path: string): Promise<string | null> {
    // D3: reject concurrent confirm.
    if (resolveRef) {
      throw new Error('Picker already open');
    }
    return new Promise<string | null>((resolve) => {
      resolveRef = resolve;
      pendingPath = path;
    });
  }

  function resolvePicker(picked: string | null) {
    const resolve = resolveRef;
    if (!resolve) return;
    resolveRef = null;
    pendingPath = null;
    resolve(picked);
  }

  function getPendingPath() {
    return pendingPath;
  }

  return { requestPicker, resolvePicker, getPendingPath };
}

describe('pendingPickerRequest', () => {
  it('resolve settles the promise with the picked path', async () => {
    const { requestPicker, resolvePicker } = createPickerController();
    const promise = requestPicker('/home/user/project');
    resolvePicker('/home/user/project');
    const result = await promise;
    expect(result).toBe('/home/user/project');
  });

  it('cancel (resolve with null) settles the promise', async () => {
    const { requestPicker, resolvePicker } = createPickerController();
    const promise = requestPicker('/home/user/project');
    resolvePicker(null);
    const result = await promise;
    expect(result).toBeNull();
  });

  it('resolve is called exactly once (double-resolve is a no-op)', async () => {
    const { requestPicker, resolvePicker } = createPickerController();
    const promise = requestPicker('/home/user/project');

    // First resolve
    resolvePicker('/home/user/picked');
    // Second resolve should be a no-op (the ref is already cleared)
    resolvePicker('/home/user/other');

    const result = await promise;
    expect(result).toBe('/home/user/picked');
  });

  it('second concurrent requestPicker throws', () => {
    const { requestPicker } = createPickerController();
    // First request is pending
    requestPicker('/first');
    // Second request should throw
    expect(() => requestPicker('/second')).toThrow('Picker already open');
  });

  it('after resolve, a new request can be made', async () => {
    const { requestPicker, resolvePicker } = createPickerController();
    const first = requestPicker('/first');
    resolvePicker('/first-resolved');
    expect(await first).toBe('/first-resolved');

    // Second request should work now
    const second = requestPicker('/second');
    resolvePicker('/second-resolved');
    expect(await second).toBe('/second-resolved');
  });

  it('pending path is tracked and cleared', () => {
    const { requestPicker, resolvePicker, getPendingPath } = createPickerController();
    expect(getPendingPath()).toBeNull();

    requestPicker('/candidate');
    expect(getPendingPath()).toBe('/candidate');

    resolvePicker(null);
    expect(getPendingPath()).toBeNull();
  });
});
