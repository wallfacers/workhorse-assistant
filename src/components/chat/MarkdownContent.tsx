import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import morphdom from 'morphdom';
import DOMPurify from 'dompurify';
import { stream, type Block } from './markdown-stream';
import { highlightCode } from './highlighter';
import { writeClipboardText } from '../../ipc/clipboard';

/**
 * Streaming-safe markdown renderer (ported from data-talk's marked + morphdom
 * engine, slimmed to workhorse's needs: code blocks with Shiki, copy button,
 * GFM tables/lists/links).
 *
 * Why not react-markdown: it re-parses the full markdown and re-reconciles the
 * whole element tree on every streaming delta, rebuilding code-block DOM each
 * frame → visible jitter. Here:
 *   - `stream()` isolates the trailing open code fence into a stable block.
 *   - completed blocks are hash-cached and never re-parsed.
 *   - `morphdom` patches the DOM with minimal mutations (growing code is an
 *     append-only text diff), so already-rendered content does not move.
 *   - completed code blocks are highlighted by Shiki asynchronously and patched
 *     in once, then served from cache.
 */

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript', js: 'JavaScript', typescript: 'TypeScript', ts: 'TypeScript',
  jsx: 'JSX', tsx: 'TSX', python: 'Python', py: 'Python', java: 'Java', kotlin: 'Kotlin',
  c: 'C', cpp: 'C++', 'c++': 'C++', csharp: 'C#', cs: 'C#', go: 'Go', golang: 'Go',
  rust: 'Rust', rs: 'Rust', php: 'PHP', ruby: 'Ruby', rb: 'Ruby', swift: 'Swift',
  bash: 'Bash', sh: 'Shell', shell: 'Shell', json: 'JSON', html: 'HTML', xml: 'XML',
  css: 'CSS', scss: 'SCSS', sql: 'SQL', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
  markdown: 'Markdown', md: 'Markdown', dockerfile: 'Dockerfile', diff: 'Diff',
};

marked.use({ gfm: true, breaks: false });

const COPY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

// Per-instance block cache + global Shiki cache (keyed by language\0code).
const shikiCache = new Map<string, string>();
let instanceCounter = 0;

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return h.toString(36);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function langLabel(lang: string): string {
  const k = lang.toLowerCase();
  return LANGUAGE_LABELS[k] ?? (lang ? lang.replace(/^[a-z]/, (c) => c.toUpperCase()) : '');
}

const STREAMING_CODE_BODY_STYLE =
  'display:block;white-space:pre;word-break:normal;overflow-wrap:normal;min-height:1.5em';

/** Stable HTML for the trailing open (streaming) code fence — plain escaped text
 *  with a trailing newline so the stream-code → highlighted swap is a no-op diff. */
function renderStreamingCodeBlock(block: Block): string {
  const language = block.language ?? '';
  const languageClass = language ? `language-${escapeHtml(language)}` : '';
  const label = langLabel(language);
  const raw = block.code ?? '';
  const code = raw.endsWith('\n') ? raw : `${raw}\n`;
  return [
    '<div data-component="markdown-code" data-streaming-code="true">',
    '<div data-slot="markdown-code-bar">',
    `<span data-slot="markdown-code-language">${escapeHtml(label)}</span>`,
    `<button data-slot="markdown-copy-button" type="button" aria-label="复制代码">${COPY_SVG}</button>`,
    '</div>',
    `<pre data-streaming-code="true"><code class="${languageClass}" style="${STREAMING_CODE_BODY_STYLE}">${escapeHtml(code)}</code></pre>`,
    '</div>',
  ].join('');
}

interface MarkdownContentProps {
  content: string;
  streaming?: boolean;
}

export default function MarkdownContent({ content, streaming = false }: MarkdownContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const instanceKey = useRef(`md-${++instanceCounter}`).current;
  const blockCache = useRef<Map<string, { hash: string; html: string }>>(new Map());
  // Bumped when an async Shiki highlight resolves, to re-patch with colour.
  const [, setVersion] = useState(0);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // 1) Build HTML string from streaming-aware blocks (cache stable ones).
    const blocks = stream(content, streaming);
    const html = blocks.map((block, i) => {
      if (block.mode === 'stream-code') return renderStreamingCodeBlock(block);
      const key = `${instanceKey}:${i}:${block.mode}`;
      const h = hash(block.raw);
      const cached = blockCache.current.get(key);
      if (cached && cached.hash === h) return cached.html;
      const parsed = marked.parse(block.src, { async: false }) as string;
      const safe = DOMPurify.isSupported ? DOMPurify.sanitize(parsed) : parsed;
      blockCache.current.set(key, { hash: h, html: safe });
      return safe;
    }).join('');

    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 2) Wrap bare <pre> (from marked) in the code-block chrome.
    decorateCodeBlocks(temp);
    // 3) Inject Shiki colours for completed code blocks (async on first sight).
    applyShiki(temp);
    // 4) Wrap tables for horizontal scroll.
    wrapTables(temp);

    // 5) Minimal DOM patch — already-rendered nodes stay put (no jitter).
    morphdom(container, temp, { childrenOnly: true });
  }, [content, streaming, instanceKey]);

  // Highlight completed code blocks: serve from cache, else schedule async.
  function applyShiki(root: HTMLElement) {
    const blocksEls = Array.from(root.querySelectorAll('[data-component="markdown-code"]')) as HTMLElement[];
    for (const el of blocksEls) {
      if (el.getAttribute('data-streaming-code') === 'true') continue; // still streaming
      const code = el.querySelector('code');
      const text = code?.textContent?.replace(/\n$/, '') ?? '';
      if (!text) continue;
      const lang = (code?.className.match(/language-([^\s]+)/)?.[1] ?? '').toLowerCase();
      const cacheKey = `${lang}\0${text}`;
      const cachedHtml = shikiCache.get(cacheKey);
      const body = el.querySelector('pre');
      if (cachedHtml) {
        // Replace the plain <pre> with the Shiki wrapper (idempotent).
        if (body && !el.querySelector('.shiki-wrapper')) {
          const wrap = document.createElement('div');
          wrap.className = 'shiki-wrapper custom-scrollbar';
          wrap.innerHTML = cachedHtml;
          body.replaceWith(wrap);
        }
        continue;
      }
      // Not cached yet — schedule highlight, then re-render to patch colour in.
      void highlightCode(lang, text).then((shikiHtml) => {
        shikiCache.set(cacheKey, shikiHtml);
        if (aliveRef.current) setVersion((v) => v + 1);
      }).catch(() => { /* leave plain on failure */ });
    }
  }

  return <div ref={ref} data-component="markdown" className="markdown-body" />;
}

/** Wrap each bare <pre> (marked output) in the code-block chrome with a top bar
 *  (language label + copy button), matching the streaming block's structure. */
function decorateCodeBlocks(root: HTMLElement): void {
  const pres = Array.from(root.querySelectorAll('pre'));
  for (const pre of pres) {
    if (pre.parentElement?.getAttribute('data-component') === 'markdown-code') continue;
    if (pre.getAttribute('data-streaming-code') === 'true') continue;
    const code = pre.querySelector('code');
    const lang = (code?.className.match(/language-([^\s]+)/)?.[1] ?? '').toLowerCase();
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-component', 'markdown-code');
    const bar = document.createElement('div');
    bar.setAttribute('data-slot', 'markdown-code-bar');
    const label = document.createElement('span');
    label.setAttribute('data-slot', 'markdown-code-language');
    label.textContent = langLabel(lang);
    const btn = document.createElement('button');
    btn.setAttribute('data-slot', 'markdown-copy-button');
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', '复制代码');
    btn.innerHTML = COPY_SVG;
    bar.append(label, btn);
    pre.parentNode?.replaceChild(wrapper, pre);
    wrapper.append(bar, pre);
  }
}

function wrapTables(root: HTMLElement): void {
  for (const table of Array.from(root.querySelectorAll('table'))) {
    if (table.parentElement?.getAttribute('data-slot') === 'markdown-table-scroll') continue;
    const wrap = document.createElement('div');
    wrap.setAttribute('data-slot', 'markdown-table-scroll');
    wrap.className = 'overflow-x-auto custom-scrollbar my-2';
    table.parentNode?.replaceChild(wrap, table);
    wrap.appendChild(table);
  }
}

// --- Copy button: one delegated listener at the document level -------------
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element)?.closest?.('[data-slot="markdown-copy-button"]') as HTMLElement | null;
    if (!btn) return;
    const block = btn.closest('[data-component="markdown-code"]');
    const text = block?.querySelector('code')?.textContent?.replace(/\n$/, '') ?? '';
    if (!text) return;
    void writeClipboardText(text).then((result: { ok: boolean }) => {
      if (!result.ok) return;
      const original = btn.innerHTML;
      btn.innerHTML = CHECK_SVG;
      window.setTimeout(() => { btn.innerHTML = original; }, 2000);
    });
  });
}
