import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter, indentOnInput, bracketMatching, foldKeymap } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { Eye, Code } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';

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
// File type classification
// ---------------------------------------------------------------------------

type FileViewMode = 'code' | 'markdown' | 'image';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);

function classifyFile(fileName: string): FileViewMode {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return 'code';
  const ext = fileName.slice(dotIndex).toLowerCase();
  if (ext === '.md' || ext === '.mdx' || ext === '.markdown') return 'markdown';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  return 'code';
}

// ---------------------------------------------------------------------------
// Markdown preview component (uses marked + DOMPurify)
// ---------------------------------------------------------------------------

import { marked } from 'marked';
import DOMPurify from 'dompurify';

function MarkdownPreview({ content, isDark }: { content: string; isDark: boolean }) {
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false, gfm: true, breaks: true }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);

  return (
    <div
      className={`h-full w-full overflow-auto custom-scrollbar p-6 ${isDark ? 'prose-invert' : ''}`}
      style={{
        backgroundColor: isDark ? 'var(--color-surface-dark-elevated)' : 'var(--color-surface)',
        color: isDark ? 'var(--color-on-surface-dark)' : 'var(--color-on-surface)',
      }}
    >
      <div
        className="markdown-preview max-w-none text-[13px] leading-relaxed"
        style={{
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .markdown-preview h1 { font-size: 1.5rem; font-weight: 600; margin: 1.5rem 0 0.75rem; letter-spacing: -0.01em; color: ${isDark ? 'var(--color-on-surface-dark)' : 'var(--color-on-surface)'}; }
        .markdown-preview h2 { font-size: 1.25rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: ${isDark ? 'var(--color-on-surface-dark)' : 'var(--color-on-surface)'}; }
        .markdown-preview h3 { font-size: 1.1rem; font-weight: 600; margin: 1rem 0 0.5rem; color: ${isDark ? 'var(--color-on-surface-dark)' : 'var(--color-on-surface)'}; }
        .markdown-preview p { margin: 0.5rem 0; }
        .markdown-preview a { color: var(--color-accent-warm); text-decoration: underline; }
        .markdown-preview code { font-family: ui-monospace, 'JetBrains Mono', Consolas, monospace; font-size: 0.85em; background: ${isDark ? 'var(--color-surface-dark-muted)' : 'var(--color-surface-muted)'}; padding: 0.15em 0.4em; border-radius: 4px; }
        .markdown-preview pre { background: ${isDark ? 'var(--color-surface-dark-muted)' : 'var(--color-surface-muted)'}; padding: 12px 16px; border-radius: var(--radius-lg, 16px); overflow-x: auto; margin: 0.75rem 0; border: 1px solid ${isDark ? 'var(--color-outline-dark)' : 'var(--color-outline)'}; }
        .markdown-preview pre code { background: none; padding: 0; border-radius: 0; font-size: 13px; }
        .markdown-preview blockquote { border-left: 3px solid var(--color-outline); padding-left: 12px; margin: 0.75rem 0; color: var(--color-on-surface-muted); }
        .markdown-preview ul, .markdown-preview ol { padding-left: 1.5rem; margin: 0.5rem 0; }
        .markdown-preview li { margin: 0.25rem 0; }
        .markdown-preview table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
        .markdown-preview th, .markdown-preview td { border: 1px solid ${isDark ? 'var(--color-outline-dark)' : 'var(--color-outline)'}; padding: 6px 12px; text-align: left; font-size: 13px; }
        .markdown-preview th { background: ${isDark ? 'var(--color-surface-dark-muted)' : 'var(--color-surface-muted)'}; font-weight: 600; }
        .markdown-preview img { max-width: 100%; border-radius: 8px; margin: 0.5rem 0; }
        .markdown-preview hr { border: none; border-top: 1px solid ${isDark ? 'var(--color-outline-dark)' : 'var(--color-outline)'}; margin: 1rem 0; }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image preview component
// ---------------------------------------------------------------------------

function ImagePreview({ filePath, fileName }: { filePath: string; fileName: string }) {
  const src = convertFileSrc(filePath);
  return (
    <div
      className="h-full w-full flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-surface-muted)' }}
    >
      <div className="text-center space-y-3">
        <img
          src={src}
          alt={fileName}
          className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-lg border border-outline dark:border-outline-dark shadow-sm"
          style={{ backgroundColor: 'var(--color-surface)' }}
        />
        <p className="text-[11px] text-on-surface-muted dark:text-on-surface-dark-muted font-mono">{fileName}</p>
      </div>
    </div>
  );
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
  const [content, setContent] = useState<string>('');
  const isDirtyRef = useRef(isDirty);

  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const viewMode = useMemo(() => classifyFile(fileName), [fileName]);
  // For markdown: toggle between source code and rendered preview.
  const [showPreview, setShowPreview] = useState(viewMode === 'markdown');

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

      // Image files don't need text content — skip the read entirely.
      if (classifyFile(fileName) === 'image') {
        setLoading(false);
        return;
      }

      const result = await fsReadFile(filePath);
      if (cancelled) return;

      if (!result.ok) {
        setError(result.error.message);
        setLoading(false);
        return;
      }

      const fileContent = result.value;
      if (cancelled) return;
      setSavedContent(fileContent);
      setContent(fileContent);

      const langExts = getLanguageExtensions(fileName);

      const state = EditorState.create({
        doc: fileContent,
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
              setContent(newContent);
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

  // Image files — no editor, just preview.
  if (viewMode === 'image') {
    return (
      <div className="h-full w-full relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/80 dark:bg-surface-dark-elevated/80">
            <p className="text-[12px] text-on-surface-muted dark:text-on-surface-dark-muted">{t('editor.loading')}</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center space-y-2">
              <p className="text-[13px] text-danger font-medium">{t('editor.error')}</p>
              <p className="text-[12px] text-on-surface-muted dark:text-on-surface-dark-muted">{error}</p>
            </div>
          </div>
        ) : (
          <ImagePreview filePath={filePath} fileName={fileName} />
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full relative flex flex-col">
      {/* Toolbar: markdown preview toggle */}
      {viewMode === 'markdown' && !loading && !error && (
        <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-outline/40 dark:border-outline-dark/40 bg-surface dark:bg-surface-dark-elevated">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
              !showPreview
                ? 'bg-surface-muted dark:bg-surface-dark text-on-surface dark:text-on-canvas-dark shadow-sm'
                : 'text-on-surface-muted dark:text-on-canvas-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark'
            }`}
          >
            <Code className="w-3 h-3" />
            {t('editor.source')}
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
              showPreview
                ? 'bg-surface-muted dark:bg-surface-dark text-on-surface dark:text-on-canvas-dark shadow-sm'
                : 'text-on-surface-muted dark:text-on-canvas-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark'
            }`}
          >
            <Eye className="w-3 h-3" />
            {t('editor.preview')}
          </button>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/80 dark:bg-surface-dark-elevated/80 z-10">
          <div className="text-center space-y-1">
            <p className="text-[12px] text-on-surface-muted dark:text-on-surface-dark-muted">{t('editor.loading')}</p>
            <p className="text-[10px] font-mono text-on-surface-muted/60 dark:text-on-surface-dark-muted/60 max-w-[300px] truncate">{filePath}</p>
          </div>
        </div>
      )}

      {/* Markdown preview — hides the editor behind it */}
      {viewMode === 'markdown' && showPreview && !loading && !error && (
        <div className="flex-1 min-h-0">
          <MarkdownPreview content={content} isDark={isDarkMode} />
        </div>
      )}

      {/* Editor container — always in DOM so CodeMirror can mount */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{
          // Hide visually when showing markdown preview, but keep in DOM.
          position: viewMode === 'markdown' && showPreview && !loading ? 'absolute' : undefined,
          opacity: viewMode === 'markdown' && showPreview && !loading ? 0 : undefined,
          pointerEvents: viewMode === 'markdown' && showPreview && !loading ? 'none' : undefined,
        }}
      />
    </div>
  );
}
