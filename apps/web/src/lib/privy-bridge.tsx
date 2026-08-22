import { useEffect } from 'react';
import { PrivyProvider, usePrivy as useRealPrivy } from '@privy-io/react-auth';
import { useSolanaWallets as useRealSolana } from '@privy-io/react-auth/solana';

import { PRIVY_APP_ID, privyConfig } from './privy';
import type { AuthUser, AuthValue, SolanaValue, SolanaWallet } from './auth';

// The lazy half of the auth bridge (see ./auth.tsx). This file is the ONLY
// place that statically imports the Privy SDK, which is what keeps those
// ~600KB out of the entry chunk. It mounts the real provider off to the side
// and feeds live values back through the bridge context; Privy's own modals
// portal into document.body, so their position in the tree does not matter.

interface BridgeProps {
  onAuth: (v: AuthValue) => void;
  onSolana: (v: SolanaValue) => void;
}

function Feeder({ onAuth, onSolana }: BridgeProps) {
  const p = useRealPrivy();
  const s = useRealSolana();

  useEffect(() => {
    onAuth({
      ready: p.ready,
      authenticated: p.authenticated,
      user: (p.user ?? null) as unknown as AuthUser | null,
      login: () => p.login(),
      logout: () => p.logout(),
      getAccessToken: () => p.getAccessToken(),
      linkEmail: () => p.linkEmail(),
      linkGoogle: () => p.linkGoogle(),
      linkWallet: () => p.linkWallet(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- method identities churn; state fields are the real signal
  }, [p.ready, p.authenticated, p.user]);

  useEffect(() => {
    onSolana({
      ready: s.ready,
      wallets: s.wallets as unknown as SolanaWallet[],
      createWallet: () => s.createWallet(),
      exportWallet: (opts) => s.exportWallet(opts),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same rationale as above
  }, [s.ready, s.wallets]);

  return null;
}

export default function PrivyBridge(props: BridgeProps) {
  if (!PRIVY_APP_ID) {
    console.error(
      '[HeroPad] VITE_PRIVY_APP_ID is not set. Login will not work. ' +
        'Add it to apps/web/.env (local) or to Vercel Project → Environment Variables.'
    );
  }
  return (
    <PrivyProvider appId={PRIVY_APP_ID ?? ''} config={privyConfig}>
      <Feeder {...props} />
    </PrivyProvider>
  );
}
