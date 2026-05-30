/**
 * Lazy Shiki singleton highlighter for chat code blocks.
 *
 * Creates one highlighter instance (github-light + github-dark) behind a
 * memoized promise. Uses `defaultColor: false` so Shiki emits CSS-variable
 * colours (`--shiki-light`, `--shiki-dark`) per token, enabling theme
 * switching via CSS without re-highlighting.
 */

import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
} from 'shiki';

const LANGUAGES: BundledLanguage[] = [
  'javascript',
  'typescript',
  'python',
  'rust',
  'bash',
  'json',
  'html',
  'css',
  'sql',
  'yaml',
  'markdown',
];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: LANGUAGES,
    }).catch((err) => {
      // Don't cache a rejected promise — otherwise a transient WASM load
      // failure would permanently disable highlighting for every block.
      // Reset so the next call retries.
      highlighterPromise = null;
      throw err;
    });
  }
  return highlighterPromise;
}

/**
 * Highlight `code` as `lang`, returning HTML with `--shiki-light` /
 * `--shiki-dark` CSS variables per token (no inline `color`).
 */
export async function highlightCode(
  lang: string,
  code: string,
): Promise<string> {
  const hl = await getHighlighter();

  // Normalise language name to a bundled language Shiki recognises.
  const resolvedLang = resolveLang(lang);

  return hl.codeToHtml(code, {
    lang: resolvedLang,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
}

function resolveLang(lang: string): BundledLanguage {
  const normalised = lang.toLowerCase().replace(/[^a-z0-9+]/g, '');
  const aliases: Record<string, BundledLanguage> = {
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'markdown',
  };
  const resolved = aliases[normalised] ?? normalised;
  if (LANGUAGES.includes(resolved as BundledLanguage)) {
    return resolved as BundledLanguage;
  }
  // Fallback to a safe default for unknown languages
  return 'markdown';
}
