import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PrivyProvider } from '@privy-io/react-auth';

import App from './App';
import { PRIVY_APP_ID, privyConfig } from './lib/privy';
import './styles/index.css';

// Fail loudly in dev if VITE_PRIVY_APP_ID is missing — easier than a cryptic
// runtime error from the Privy SDK. In production this is set in Vercel env.
if (!PRIVY_APP_ID) {
  // eslint-disable-next-line no-console
  console.error(
    '[HeroPad] VITE_PRIVY_APP_ID is not set. Login will not work. ' +
      'Add it to apps/web/.env (local) or to Vercel Project → Environment Variables.'
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PrivyProvider appId={PRIVY_APP_ID ?? ''} config={privyConfig}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrivyProvider>
  </React.StrictMode>
);
