import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { I18nProvider } from './i18n';
import { AuthProvider } from './lib/auth';
import './styles/index.css';

// NOTE: no Privy import here — that is the whole point. AuthProvider renders
// the app instantly against a stub and pulls the real SDK in a lazy chunk
// (lib/privy-bridge), which is what took ~600KB off the entry bundle and the
// mobile Lighthouse score off its knees. The missing-app-id warning moved
// into the bridge, next to the SDK it concerns.

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <I18nProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </AuthProvider>
  </React.StrictMode>
);

// The static first screen in index.html (#prehero) is removed from inside
// App, in an effect that runs after React's first commit. It used to be two
// requestAnimationFrames from here — but createRoot().render() is
// asynchronous, and on a slow phone the commit landed AFTER those frames:
// the placeholder vanished, the screen went blank, React painted a moment
// later, and Lighthouse scored the blank-then-paint as a layout shift of 1.

// Register the service worker only in production. In dev, Vite HMR conflicts
// with SW caching and we don't need offline support while iterating.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent fail — PWA is a progressive enhancement, not critical.
    });
  });
}
