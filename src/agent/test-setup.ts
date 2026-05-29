// jsdom does not implement `CSS.escape`, which the fallback tools use to build
// attribute selectors. Real Tauri webviews (Chromium/WebKit) have it; polyfill
// a minimal version for the test environment only.
if (typeof globalThis.CSS === 'undefined') {
  // @ts-expect-error — minimal shim, only `escape` is exercised in tests.
  globalThis.CSS = {};
}
if (typeof globalThis.CSS.escape !== 'function') {
  globalThis.CSS.escape = (value: string): string =>
    String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}
