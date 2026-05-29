import { defineConfig } from 'vitest/config';

// Unit tests for the agent control surface (src/agent). jsdom gives the
// fallback tools a DOM to query; we keep this separate from the Tauri vite
// config so the desktop build is untouched.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/agent/test-setup.ts'],
  },
});
