import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ---------------------------------------------------------------------------
// Global error handlers — catch unhandled errors/rejections so they don't
// silently vanish in the desktop shell (where there's no DevTools by default).
// ---------------------------------------------------------------------------

window.addEventListener('error', (event) => {
  console.error('[global]', event.message, event.filename, event.lineno, event.colno, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  // Some errors arrive as ErrorEvent or native Error; extract a readable string.
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[unhandledrejection]', msg, reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
