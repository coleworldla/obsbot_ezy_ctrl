import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Surface renderer-side failures in the in-app log.
window.addEventListener('error', (e) => {
  void window.ezy?.log.report('error', `renderer: ${e.message} (${e.filename?.split('/').pop() ?? '?'}:${e.lineno})`);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { message?: string } | undefined;
  void window.ezy?.log.report('error', `renderer promise: ${r?.message ?? String(e.reason)}`);
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
