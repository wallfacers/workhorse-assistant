/**
 * Generic `data-testid` fallback tools for long-tail elements not covered by a
 * registered semantic action (design D6). Two tiers of safety:
 *
 *   - `click_by_testid` (action, unsafe): clicks ONLY a visible element that
 *     carries both a stable `data-testid` AND an explicit `data-agent-clickable`
 *     opt-in. Missing opt-in → `forbidden`; absent or hidden → `not_found`.
 *     Destructive controls omit the opt-in and stay unreachable.
 *   - `read_by_testid` (reader, safe): reads any element with a `data-testid`
 *     (no opt-in), returning a bounded field subset and NEVER raw `innerHTML`.
 *
 * Selection uses these attributes only — never positional or visual cues.
 */

import { ToolError } from './contract';
import { registerAction } from './actionRegistry';
import { registerState } from './stateRegistry';

const OPT_IN_ATTR = 'data-agent-clickable';

interface TestIdInput {
  testId?: unknown;
}

function readTestId(input: unknown): string | null {
  const id = (input as TestIdInput)?.testId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Locate an element by its `data-testid` (CSS-escaped). */
function findByTestId(testId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-testid="${CSS.escape(testId)}"]`,
  );
}

/**
 * Visible = laid out and non-empty: non-null `offsetParent` (rules out
 * `display:none` and `display:none` ancestors) AND a non-zero bounding box.
 */
export function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

const TEST_ID_SCHEMA = {
  type: 'object',
  properties: { testId: { type: 'string' } },
  required: ['testId'],
} as const;

/**
 * Register the two fallback tools into the action/state registries. Call once
 * at app startup; returns a combined unregister fn.
 */
export function registerFallbackTools(): () => void {
  const unregisterClick = registerAction(
    {
      name: 'click_by_testid',
      description:
        'Click a UI element identified by its data-testid. Only works on ' +
        'elements explicitly marked clickable by the agent (data-agent-clickable) ' +
        'and currently visible. Prefer a registered semantic action when one exists.',
      inputSchema: TEST_ID_SCHEMA as Record<string, unknown>,
      outputSchema: { type: 'null' },
    },
    (input) => {
      const testId = readTestId(input);
      if (!testId) {
        throw new ToolError('validation', 'click_by_testid requires a non-empty testId');
      }
      const el = findByTestId(testId);
      if (!el) {
        throw new ToolError('not_found', `no element with data-testid="${testId}"`);
      }
      if (!el.hasAttribute(OPT_IN_ATTR)) {
        throw new ToolError(
          'forbidden',
          `element "${testId}" exists but lacks ${OPT_IN_ATTR}`,
        );
      }
      if (!isVisible(el)) {
        throw new ToolError('not_found', `element "${testId}" is not visible`);
      }
      el.click();
      return null;
    },
  );

  const unregisterRead = registerState(
    {
      name: 'read_by_testid',
      description:
        'Read the state of a UI element identified by its data-testid: its tag, ' +
        'visible text, disabled flag, and visibility. Side-effect-free.',
      inputSchema: TEST_ID_SCHEMA as Record<string, unknown>,
      outputSchema: {
        type: 'object',
        properties: {
          tagName: { type: 'string' },
          textContent: { type: 'string' },
          disabled: { type: 'boolean' },
          visible: { type: 'boolean' },
        },
        required: ['tagName', 'textContent', 'disabled', 'visible'],
      },
    },
    (input) => {
      const testId = readTestId(input);
      if (!testId) {
        throw new ToolError('validation', 'read_by_testid requires a non-empty testId');
      }
      const el = findByTestId(testId);
      if (!el) {
        throw new ToolError('not_found', `no element with data-testid="${testId}"`);
      }
      // Bounded subset only — never raw innerHTML.
      return {
        tagName: el.tagName.toLowerCase(),
        textContent: el.textContent?.trim() ?? '',
        disabled:
          (el as HTMLButtonElement).disabled ??
          el.getAttribute('aria-disabled') === 'true',
        visible: isVisible(el),
      };
    },
  );

  return () => {
    unregisterClick();
    unregisterRead();
  };
}
