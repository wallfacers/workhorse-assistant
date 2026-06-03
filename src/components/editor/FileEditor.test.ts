import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// React 19 needs this flag for act() to work without warnings.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Mock CodeMirror's EditorView. `throwOnConstruct` lets a test simulate a
//     runtime failure during mount (e.g. a webkit2gtk-only DOM quirk) to prove
//     the editor surfaces an error instead of getting stuck on "loading…". ---
const { editorViewCtor, control } = vi.hoisted(() => ({
  editorViewCtor: vi.fn(),
  control: { throwOnConstruct: false },
}));

vi.mock('@codemirror/view', () => {
  class FakeEditorView {
    state: unknown;
    dom: HTMLElement;
    constructor(cfg: { state: unknown; parent: HTMLElement }) {
      editorViewCtor(cfg);
      if (control.throwOnConstruct) throw new Error('boom: webview cannot mount editor');
      this.state = cfg.state;
      this.dom = document.createElement('div');
      this.dom.className = 'cm-editor';
      cfg.parent.appendChild(this.dom);
    }
    destroy() {
      this.dom.remove();
    }
    static theme() {
      return [];
    }
    static baseTheme() {
      return [];
    }
    static updateListener = { of: () => [] };
  }
  return {
    EditorView: FakeEditorView,
    keymap: { of: () => [] },
    lineNumbers: () => [],
    highlightActiveLineGutter: () => [],
    highlightActiveLine: () => [],
    drawSelection: () => [],
    rectangularSelection: () => [],
    highlightSpecialChars: () => [],
  };
});

vi.mock('@codemirror/state', () => ({
  EditorState: { create: (cfg: unknown) => ({ __state: cfg }) },
}));

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: () => [],
  historyKeymap: [],
  indentWithTab: {},
}));
vi.mock('@codemirror/language', () => ({
  syntaxHighlighting: () => [],
  defaultHighlightStyle: {},
  foldGutter: () => [],
  indentOnInput: () => [],
  bracketMatching: () => [],
  foldKeymap: [],
}));
vi.mock('@codemirror/search', () => ({ searchKeymap: [], highlightSelectionMatches: () => [] }));
vi.mock('@codemirror/autocomplete', () => ({
  autocompletion: () => [],
  completionKeymap: [],
  closeBrackets: () => [],
  closeBracketsKeymap: [],
}));
vi.mock('@codemirror/lang-javascript', () => ({ javascript: () => [] }));
vi.mock('@codemirror/lang-python', () => ({ python: () => [] }));
vi.mock('@codemirror/lang-rust', () => ({ rust: () => [] }));
vi.mock('@codemirror/lang-html', () => ({ html: () => [] }));
vi.mock('@codemirror/lang-css', () => ({ css: () => [] }));
vi.mock('@codemirror/lang-json', () => ({ json: () => [] }));
vi.mock('@codemirror/lang-markdown', () => ({ markdown: () => [] }));
vi.mock('@codemirror/lang-java', () => ({ java: () => [] }));
vi.mock('@codemirror/lang-cpp', () => ({ cpp: () => [] }));
vi.mock('@codemirror/lang-sql', () => ({ sql: () => [] }));
vi.mock('@codemirror/lang-xml', () => ({ xml: () => [] }));

vi.mock('lucide-react', () => ({ Eye: () => null, Code: () => null }));
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => p }));
vi.mock('marked', () => ({ marked: { parse: (s: string) => s } }));
vi.mock('dompurify', () => ({ default: { sanitize: (s: string) => s } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../../context', () => ({ useApp: () => ({ isDarkMode: false }) }));

const { fsReadFile, fsWriteFile } = vi.hoisted(() => ({
  fsReadFile: vi.fn(async () => ({ ok: true, value: 'console.log(1)\n' })),
  fsWriteFile: vi.fn(async () => ({ ok: true, value: undefined })),
}));
vi.mock('../../ipc', () => ({ fsReadFile, fsWriteFile, isTauri: () => true }));

import FileEditor from './FileEditor';

afterEach(() => {
  editorViewCtor.mockClear();
  fsReadFile.mockClear();
  control.throwOnConstruct = false;
});

async function flush() {
  // Let queued microtasks (the async IIFE in the mount effect) settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(host: HTMLElement, filePath = '/tmp/a.js') {
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(FileEditor, {
          filePath,
          isDirty: false,
          onDirtyChange: () => {},
        }),
      ),
    );
  });
  await flush();
  return root;
}

describe('FileEditor mount (React 19 + StrictMode)', () => {
  it('mounts CodeMirror into the container (not stuck on loading)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = await mount(host);

    expect(fsReadFile).toHaveBeenCalled();
    expect(editorViewCtor).toHaveBeenCalled();

    await act(async () => root.unmount());
    host.remove();
  });

  it('surfaces an error instead of hanging on "loading…" when the editor fails to construct', async () => {
    control.throwOnConstruct = true;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = await mount(host);

    // The loading overlay must be gone, and the error message visible — never a
    // silent infinite spinner.
    expect(host.textContent).toContain('editor.error');
    expect(host.textContent ?? '').not.toContain('editor.loading');

    await act(async () => root.unmount());
    host.remove();
  });

  it('does not hang on "loading…" for image files (no editor container is rendered)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    // Image files render the <img> preview and never mount CodeMirror; the
    // loading overlay must clear even though the container ref never fires.
    const root = await mount(host, '/tmp/picture.png');

    expect(host.textContent ?? '').not.toContain('editor.loading');
    expect(host.querySelector('img'), 'image preview should be shown').toBeTruthy();
    expect(editorViewCtor).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    host.remove();
  });
});
