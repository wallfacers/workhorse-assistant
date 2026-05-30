import { marked, type Tokens } from 'marked';

/**
 * Streaming block splitter — ported from data-talk's `markdown-stream.ts`.
 *
 * Splits streaming markdown so the trailing *open* (unclosed) code fence is
 * isolated into its own `stream-code` block. The renderer can then grow that
 * code block as a stable plain `<pre>` (append-only text diff) instead of
 * re-parsing it on every delta, which is the main source of code-block jitter.
 * Everything before it is one `live` block; a finished message is one `full`
 * block.
 */

export type Block = {
  raw: string;
  src: string;
  mode: 'full' | 'live' | 'stream-code';
  language?: string;
  code?: string;
  fence?: '```' | '~~~';
};

function refs(text: string): boolean {
  return /^\[[^\]]+\]:\s+\S+/m.test(text) || /^\[\^[^\]]+\]:\s+/m.test(text);
}

/** True when `raw` opens a fence that has not been closed yet. */
function open(raw: string): boolean {
  const match = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (!match) return false;
  const mark = match[1];
  if (!mark) return false;
  const char = mark[0];
  const size = mark.length;
  const last = raw.trimEnd().split('\n').at(-1)?.trim() ?? '';
  return !new RegExp(`^[\\t ]{0,3}${char}{${size},}[\\t ]*$`).test(last);
}

/**
 * Streaming deltas may deliver a not-yet-complete closing fence one character
 * at a time ("`", "``"). Strip a trailing line that is only 1..fenceLen-1 of
 * the same fence character so the visible line count stays stable until the
 * real closing fence lands.
 */
function stripPartialClosingFence(code: string, fenceMarker: '```' | '~~~'): string {
  const lastNewlineIdx = code.lastIndexOf('\n');
  if (lastNewlineIdx < 0) return code;
  const trailing = code.slice(lastNewlineIdx + 1);
  const fenceChar = fenceMarker[0];
  const fenceLen = fenceMarker.length;
  const pattern = new RegExp(`^[ \\t]{0,3}\\${fenceChar}{1,${fenceLen - 1}}$`);
  if (!pattern.test(trailing)) return code;
  return code.slice(0, lastNewlineIdx + 1);
}

function parseOpenFence(raw: string): { language: string; code: string; fence: '```' | '~~~' } | null {
  const match = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})([^\n]*)\n?([\s\S]*)$/);
  if (!match) return null;
  const marker = match[1]!.startsWith('`') ? '```' : '~~~';
  const info = (match[2] ?? '').trim();
  const language = info.split(/\s+/)[0]?.toLowerCase() ?? '';
  const rawCode = match[3] ?? '';
  return { language, code: stripPartialClosingFence(rawCode, marker), fence: marker };
}

export function stream(text: string, live: boolean): Block[] {
  if (!live) return [{ raw: text, src: text, mode: 'full' }];
  if (!text) return [{ raw: text, src: text, mode: 'live' }];
  // Reference definitions confuse the trailing-token heuristic; render whole.
  if (refs(text)) return [{ raw: text, src: text, mode: 'live' }];

  const tokens = marked.lexer(text);
  let tail = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if ((tokens[i] as { type: string }).type !== 'space') { tail = i; break; }
  }
  if (tail < 0) return [{ raw: text, src: text, mode: 'live' }];

  const last = tokens[tail];
  if (!last || last.type !== 'code') return [{ raw: text, src: text, mode: 'live' }];
  const code = last as Tokens.Code;
  if (!open(code.raw)) return [{ raw: text, src: text, mode: 'live' }];

  const openFence = parseOpenFence(code.raw);
  if (!openFence) return [{ raw: text, src: text, mode: 'live' }];

  const head = tokens.slice(0, tail).map((t) => (t as { raw: string }).raw).join('');
  const streamCode: Block = {
    raw: code.raw,
    src: code.raw,
    mode: 'stream-code',
    language: openFence.language,
    code: openFence.code,
    fence: openFence.fence,
  };
  if (!head) return [streamCode];
  return [
    { raw: head, src: head, mode: 'live' },
    streamCode,
  ];
}
