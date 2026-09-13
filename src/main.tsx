// SHIP24GO_BUILD_PROBE_1784837825
// cache-bust 1784837573
import './lang/finalRuntimeCleanup';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { I18nProvider } from './lib/i18n';
import { CurrencyProvider } from './lib/currency';
import './index.css';
import { startRuntimeTextTranslator } from './lang/runtimeTextTranslator';

startRuntimeTextTranslator();

// Register DoorDrop PWA Service Worker (installable app)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => { window.location.reload(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // update when a new SW is waiting
        if (reg.waiting) { reg.waiting.postMessage('SKIP_WAITING'); window.location.reload(); }
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              // new version ready — soft update next reload
              console.info('[DoorDrop PWA] update ready');
            }
          });
        });
      })
      .catch((err) => console.warn('[DoorDrop PWA] SW register failed', err));
  });
}

(window as any).__SHIP24GO_BUILD_PROBE__ = 'SHIP24GO_BUILD_PROBE_1784837825';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
