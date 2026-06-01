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

/** Collect visible data-testid values (capped at 20) for error context. */
function visibleTestIds(): string[] {
  const all = Array.from(document.querySelectorAll('[data-testid]'));
  return all
    .filter((el) => isVisible(el as HTMLElement))
    .slice(0, 20)
    .map((el) => el.getAttribute('data-testid')!);
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

/**
 * Register the two fallback tools into the action/state registries. Call once
 * at app startup; returns a combined unregister fn.
 */
export function registerFallbackTools(): () => void {
  const unregisterClick = registerAction(
    {
      name: 'click_by_testid',
      description:
        'Click a UI element identified by its `data-testid`. Only works on ' +
        'elements explicitly marked clickable by the agent (`data-agent-clickable`) ' +
        'and currently visible. Prefer a registered semantic action when one exists.\n\n' +
        '**Example:** `click_by_testid({testId:"send-btn"})`',
      inputSchema: {
        type: 'object',
        properties: {
          testId: {
            type: 'string',
            description: 'The data-testid attribute value of the element to click.',
          },
        },
        required: ['testId'],
      } as Record<string, unknown>,
      outputSchema: {
        type: 'object',
        properties: {
          clicked: { type: 'boolean', description: 'Whether the element was successfully clicked.' },
          testId: { type: 'string', description: 'The data-testid that was targeted.' },
          tagName: { type: 'string', description: 'The HTML tag name of the clicked element.' },
        },
        required: ['clicked', 'testId', 'tagName'],
      },
    },
    (input) => {
      const testId = readTestId(input);
      if (!testId) {
        throw new ToolError('validation', 'click_by_testid requires a non-empty testId');
      }
      const el = findByTestId(testId);
      if (!el) {
        throw new ToolError(
          'not_found',
          `no element with data-testid="${testId}"; visible testIds: ${JSON.stringify(visibleTestIds())}`,
        );
      }
      if (!el.hasAttribute(OPT_IN_ATTR)) {
        throw new ToolError(
          'forbidden',
          `element "${testId}" exists but lacks the \`${OPT_IN_ATTR}\` opt-in attribute. ` +
            'Only elements explicitly marked with this attribute can be clicked by the agent.',
        );
      }
      if (!isVisible(el)) {
        throw new ToolError(
          'not_found',
          `element "${testId}" is not visible; visible testIds: ${JSON.stringify(visibleTestIds())}`,
        );
      }
      el.click();
      return { clicked: true, testId, tagName: el.tagName.toLowerCase() };
    },
  );

  const unregisterRead = registerState(
    {
      name: 'read_by_testid',
      description:
        'Read the state of a UI element identified by its data-testid: its tag, ' +
        'visible text, disabled flag, and visibility. Side-effect-free.',
      inputSchema: {
        type: 'object',
        properties: {
          testId: {
            type: 'string',
            description: 'The data-testid attribute value of the element to read.',
          },
        },
        required: ['testId'],
      } as Record<string, unknown>,
      outputSchema: {
        type: 'object',
        properties: {
          tagName: { type: 'string', description: 'The HTML tag name (lowercase) of the element.' },
          textContent: { type: 'string', description: 'Visible text content of the element (trimmed).' },
          disabled: { type: 'boolean', description: 'Whether the element is disabled.' },
          visible: { type: 'boolean', description: 'Whether the element is laid out and non-empty.' },
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
