import { usePrivy } from '../lib/auth';
import { useSolanaWallets } from '../lib/auth';

import Collectibles from './Collectibles';
import { useT } from '../i18n';

// Profile → Your collection. Wraps the existing Collectibles widget (BITS +
// cNFT grid from Helius) under its own heading — trophies land here
// automatically since they're minted into the same collection.
//
// Address source: we only need the address STRING, so we read it from
// user.linkedAccounts first — available immediately after login — and fall
// back to the useSolanaWallets hook. This keeps the collection visible even
// when a browser wallet extension delays the Solana wallet initialization.

export default function CollectionCard() {
  const { user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { t } = useT();

  const linked = user?.linkedAccounts?.find(
    (a) => a.type === 'wallet' && (a as { chainType?: string }).chainType === 'solana'
  ) as { address?: string } | undefined;
  const walletAddress = wallets[0]?.address ?? linked?.address;

  if (!walletAddress) return null;

  return (
    <div className="mt-8 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6">
      <h2 className="font-display text-lg font-semibold text-white">{t('col.title')}</h2>
      <p className="mt-1 text-xs text-slate-500">{t('col.sub')}</p>
      <div className="mt-4">
        <Collectibles walletAddress={walletAddress} />
      </div>
    </div>
  );
}
