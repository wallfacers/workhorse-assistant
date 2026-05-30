/**
 * Lazy Shiki singleton highlighter for chat code blocks.
 *
 * Creates one highlighter instance (github-light + github-dark) behind a
 * memoized promise. Uses `defaultColor: false` so Shiki emits CSS-variable
 * colours (`--shiki-light`, `--shiki-dark`) per token, enabling theme
 * switching via CSS without re-highlighting.
 *
 * Uses the **JavaScript RegExp engine** (not the default Oniguruma WASM engine):
 * the WASM engine often fails to load inside the Tauri webview (CSP / asset
 * fetch), which silently disabled highlighting (every language rendered as flat
 * plain text). The JS engine has no WASM dependency and highlights reliably in
 * the bundled webview.
 */

import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
} from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

const LANGUAGES: BundledLanguage[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'java',
  'kotlin',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'php',
  'ruby',
  'swift',
  'bash',
  'json',
  'html',
  'xml',
  'css',
  'scss',
  'sql',
  'yaml',
  'toml',
  'markdown',
  'dockerfile',
  'diff',
];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: LANGUAGES,
      // Pure-JS regex engine — no Oniguruma WASM, reliable in the webview.
      engine: createJavaScriptRegexEngine(),
    }).catch((err) => {
      // Don't cache a rejected promise — otherwise a transient load failure
      // would permanently disable highlighting for every block. Reset so the
      // next call retries.
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

function resolveLang(lang: string): string {
  const normalised = lang.toLowerCase().replace(/[^a-z0-9+#]/g, '');
  const aliases: Record<string, BundledLanguage> = {
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    'c++': 'cpp',
    cc: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    golang: 'go',
    kt: 'kotlin',
    rb: 'ruby',
    htm: 'html',
    docker: 'dockerfile',
  };
  const resolved = aliases[normalised] ?? normalised;
  if (LANGUAGES.includes(resolved as BundledLanguage)) {
    return resolved as BundledLanguage;
  }
  // Unknown language → Shiki's built-in plain 'text' (no grammar load, never
  // throws); the block still gets the dual-theme wrapper, just no colouring.
  return 'text';
}
