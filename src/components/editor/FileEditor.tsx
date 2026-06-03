import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter, indentOnInput, bracketMatching, foldKeymap } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';

import { fsReadFile, fsWriteFile } from '../../ipc';
import { useApp } from '../../context';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Language mapping (Task 5.2)
// ---------------------------------------------------------------------------

const LANG_MAP: Record<string, () => Extension[]> = {
  '.js': () => [javascript()],
  '.jsx': () => [javascript({ jsx: true })],
  '.mjs': () => [javascript()],
  '.cjs': () => [javascript()],
  '.ts': () => [javascript({ typescript: true })],
  '.tsx': () => [javascript({ jsx: true, typescript: true })],
  '.mts': () => [javascript({ typescript: true })],
  '.py': () => [python()],
  '.pyw': () => [python()],
  '.rs': () => [rust()],
  '.html': () => [html()],
  '.htm': () => [html()],
  '.css': () => [css()],
  '.scss': () => [css()],
  '.less': () => [css()],
  '.json': () => [json()],
  '.jsonc': () => [json()],
  '.md': () => [markdown()],
  '.mdx': () => [markdown()],
  '.java': () => [java()],
  '.c': () => [cpp()],
  '.h': () => [cpp()],
  '.cpp': () => [cpp()],
  '.cc': () => [cpp()],
  '.cxx': () => [cpp()],
  '.hpp': () => [cpp()],
  '.sql': () => [sql()],
  '.xml': () => [xml()],
  '.svg': () => [xml()],
  '.yaml': () => [],
  '.yml': () => [],
  '.toml': () => [],
  '.sh': () => [],
  '.bash': () => [],
  '.zsh': () => [],
  '.go': () => [],
  '.rb': () => [],
  '.php': () => [],
  '.swift': () => [],
  '.kt': () => [],
  '.lua': () => [],
  '.r': () => [],
};

function getLanguageExtensions(fileName: string): Extension[] {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return [];
  const ext = fileName.slice(dotIndex).toLowerCase();
  const factory = LANG_MAP[ext];
  return factory ? factory() : [];
}

// ---------------------------------------------------------------------------
// Editor theme (Task 5.3) — DESIGN.md CSS variable mapping
// ---------------------------------------------------------------------------

function createEditorTheme(isDark: boolean): Extension {
  const surface = isDark ? 'var(--color-surface-dark-elevated)' : 'var(--color-surface)';
  const onSurface = isDark ? 'var(--color-on-surface-dark)' : 'var(--color-on-surface)';
  const onSurfaceMuted = isDark ? 'var(--color-on-surface-dark-muted)' : 'var(--color-on-surface-muted)';
  const outline = isDark ? 'var(--color-outline-dark)' : 'var(--color-outline)';
  const surfaceMuted = isDark ? 'var(--color-surface-dark-muted)' : 'var(--color-surface-muted)';

  return EditorView.theme({
    '&': {
      backgroundColor: surface,
      color: onSurface,
      height: '100%',
      fontSize: '13px',
    },
    '.cm-content': {
      fontFamily: "ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace",
      caretColor: onSurface,
      lineHeight: '1.6',
      padding: '4px 0',
    },
    '.cm-cursor': {
      borderLeftColor: onSurface,
      borderLeftWidth: '2px',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: isDark ? 'rgba(11, 100, 119, 0.3)' : 'rgba(11, 100, 119, 0.15)',
    },
    '.cm-gutters': {
      backgroundColor: surface,
      color: onSurfaceMuted,
      borderRight: `1px solid ${outline}`,
      paddingRight: '4px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: surfaceMuted,
    },
    '.cm-activeLine': {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    },
    '.cm-matchingBracket': {
      backgroundColor: isDark ? 'rgba(184, 66, 46, 0.25)' : 'rgba(184, 66, 46, 0.15)',
      outline: `1px solid var(--color-primary)`,
    },
    '.cm-searchMatch': {
      backgroundColor: isDark ? 'rgba(180, 115, 27, 0.3)' : 'rgba(180, 115, 27, 0.2)',
    },
    '.cm-searchMatch-selected': {
      backgroundColor: isDark ? 'rgba(180, 115, 27, 0.5)' : 'rgba(180, 115, 27, 0.35)',
    },
    '.cm-foldGutter .cm-gutterElement': {
      cursor: 'pointer',
      color: onSurfaceMuted,
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "inherit",
    },
  }, { dark: isDark });
}

// ---------------------------------------------------------------------------
// FileEditor component
// ---------------------------------------------------------------------------

interface FileEditorProps {
  filePath: string;
  isDirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
}

export default function FileEditor({ filePath, isDirty, onDirtyChange }: FileEditorProps) {
  const { isDarkMode } = useApp();
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string>('');
  const isDirtyRef = useRef(isDirty);

  // Keep the ref in sync with the prop so the keymap callback sees current state.
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // Save handler — called from Ctrl+S keymap
  const handleSave = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    const content = view.state.doc.toString();
    const result = await fsWriteFile(filePath, content);
    if (result.ok) {
      setSavedContent(content);
      onDirtyChange(false);
    } else {
      setError(t('editor.saveFailed', { error: result.error.message }));
    }
  }, [filePath, onDirtyChange, t]);

  // Mount / re-create editor when filePath or theme changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const result = await fsReadFile(filePath);
      if (cancelled) return;

      if (!result.ok) {
        setError(result.error.message);
        setLoading(false);
        return;
      }

      const content = result.value;
      if (cancelled) return;
      setSavedContent(content);

      const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
      const langExts = getLanguageExtensions(fileName);

      const state = EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          autocompletion(),
          ...langExts,
          createEditorTheme(isDarkMode),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab,
            {
              key: 'Mod-s',
              run: () => { void handleSave(); return true; },
              preventDefault: true,
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newContent = update.state.doc.toString();
              const dirty = newContent !== savedContent;
              // Only notify on transitions to avoid redundant parent renders.
              if (dirty !== isDirtyRef.current) {
                onDirtyChange(dirty);
              }
            }
          }),
          // Use the same font as DESIGN.md mono token
          EditorView.baseTheme({
            '.cm-content': {
              fontFamily: "ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace",
            },
          }),
        ],
      });

      // Destroy previous view if any
      if (viewRef.current) viewRef.current.destroy();

      const view = new EditorView({
        state,
        parent: container,
      });
      viewRef.current = view;
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally depend on filePath and isDarkMode only.
    // savedContent and handleSave are captured via closure but should not
    // trigger re-creation. handleSave is stable due to useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, isDarkMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center space-y-2">
          <p className="text-[13px] text-danger font-medium">{t('editor.error')}</p>
          <p className="text-[12px] text-on-surface-muted dark:text-on-surface-dark-muted">{error}</p>
          <button
            type="button"
            onClick={() => { setError(null); }}
            className="px-3 py-1.5 rounded-md bg-surface dark:bg-surface-dark-muted border border-outline dark:border-outline-dark text-[12px] text-on-surface dark:text-on-canvas-dark hover:bg-surface-muted dark:hover:bg-surface-dark transition-colors"
          >
            {t('editor.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/80 dark:bg-surface-dark-elevated/80 z-10">
          <p className="text-[12px] text-on-surface-muted dark:text-on-surface-dark-muted">{t('editor.loading')}</p>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
    </div>
  );
}
