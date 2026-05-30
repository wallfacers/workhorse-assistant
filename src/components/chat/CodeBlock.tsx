import { useEffect, useState, useCallback, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import { highlightCode } from './highlighter';

/**
 * CodeBlock — fenced code block with syntax highlighting, language label, copy button.
 *
 * Props:
 *   language — the fence language (e.g. "python")
 *   code     — raw source text
 *   streaming — true while the block is still growing
 *
 * Skips highlighting while `streaming` (renders plain text). Once streaming
 * completes, highlights via the Shiki singleton and renders the result as
 * dangerous HTML (Shiki output is trusted).
 */

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  rust: 'Rust',
  bash: 'Bash',
  shell: 'Shell',
  sh: 'Shell',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  yaml: 'YAML',
  yml: 'YAML',
  markdown: 'Markdown',
  md: 'Markdown',
  js: 'JavaScript',
  ts: 'TypeScript',
};

interface CodeBlockProps {
  language: string;
  code: string;
  streaming?: boolean;
}

export default function CodeBlock({ language, code, streaming = false }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Highlight when not streaming
  useEffect(() => {
    if (streaming) {
      setHighlighted(null);
      return;
    }

    let cancelled = false;
    highlightCode(language, code)
      .then((html) => {
        if (!cancelled) setHighlighted(html);
      })
      .catch(() => {
        // Fallback: plain text
        if (!cancelled) setHighlighted(null);
      });
    return () => { cancelled = true; };
  }, [language, code, streaming]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).catch(() => { /* clipboard may be unavailable */ });
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const label = LANGUAGE_LABELS[language.toLowerCase()] ?? language;

  return (
    <div
      data-component="markdown-code"
      className="my-2 rounded-lg border border-outline/50 dark:border-outline-dark/60 overflow-hidden bg-surface-muted dark:bg-surface-dark"
    >
      {/* Top bar: language label + copy button */}
      <div
        data-slot="markdown-code-bar"
        className="flex items-center justify-between px-3 py-1.5 border-b border-outline/40 dark:border-outline-dark/40 bg-surface dark:bg-surface-dark-elevated"
      >
        <span
          data-slot="markdown-code-language"
          className="text-[10.5px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
        >
          {label}
        </span>
        <button
          type="button"
          data-slot="markdown-code-actions"
          onClick={handleCopy}
          className="p-1 rounded hover:bg-gray-200/60 dark:hover:bg-neutral-700/60 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="复制代码"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Code content */}
      {highlighted ? (
        <div
          className="shiki-wrapper overflow-x-auto custom-scrollbar text-[11.5px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        <pre
          data-streaming-code="true"
          className="p-3 overflow-x-auto custom-scrollbar text-[11.5px] leading-relaxed font-mono m-0"
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
