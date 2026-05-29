import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeAction, __resetActions } from './actionRegistry';
import { executeState, __resetStates } from './stateRegistry';
import { registerFallbackTools } from './fallbackTools';

/** jsdom does no layout, so force an element to read as visible. */
function makeVisible(el: HTMLElement): void {
  Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true });
  el.getBoundingClientRect = () =>
    ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

afterEach(() => {
  __resetActions();
  __resetStates();
  document.body.innerHTML = '';
});

describe('click_by_testid', () => {
  it('clicks a visible, opted-in element', async () => {
    const off = registerFallbackTools();
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'go');
    btn.setAttribute('data-agent-clickable', '');
    makeVisible(btn);
    const onClick = vi.fn();
    btn.addEventListener('click', onClick);
    document.body.appendChild(btn);

    const result = await executeAction('click_by_testid', { testId: 'go' });
    expect(result).toEqual({ ok: true, value: null });
    expect(onClick).toHaveBeenCalledOnce();
    off();
  });

  it('refuses an element lacking the opt-in (forbidden)', async () => {
    const off = registerFallbackTools();
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'danger');
    makeVisible(btn);
    const onClick = vi.fn();
    btn.addEventListener('click', onClick);
    document.body.appendChild(btn);

    const result = await executeAction('click_by_testid', { testId: 'danger' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('forbidden');
    expect(onClick).not.toHaveBeenCalled();
    off();
  });

  it('returns not_found for a present-but-hidden element', async () => {
    const off = registerFallbackTools();
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'hidden');
    btn.setAttribute('data-agent-clickable', '');
    // No makeVisible → offsetParent is null in jsdom → hidden.
    document.body.appendChild(btn);

    const result = await executeAction('click_by_testid', { testId: 'hidden' });
    if (!result.ok) expect(result.error.kind).toBe('not_found');
    off();
  });

  it('returns not_found for a missing test id', async () => {
    const off = registerFallbackTools();
    const result = await executeAction('click_by_testid', { testId: 'absent' });
    if (!result.ok) expect(result.error.kind).toBe('not_found');
    off();
  });
});

describe('read_by_testid', () => {
  it('returns a bounded field subset and never innerHTML', async () => {
    const off = registerFallbackTools();
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'run');
    btn.disabled = true;
    btn.innerHTML = '<span>Run</span>';
    document.body.appendChild(btn);

    const result = await executeState('read_by_testid', { testId: 'run' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = result.value as Record<string, unknown>;
      expect(value).toEqual({
        tagName: 'button',
        textContent: 'Run',
        disabled: true,
        visible: false, // jsdom: no layout
      });
      expect(value).not.toHaveProperty('innerHTML');
    }
    off();
  });

  it('returns not_found for a missing test id', async () => {
    const off = registerFallbackTools();
    const result = await executeState('read_by_testid', { testId: 'absent' });
    if (!result.ok) expect(result.error.kind).toBe('not_found');
    off();
  });
});
