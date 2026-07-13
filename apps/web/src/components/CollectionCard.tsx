import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';

import Collectibles from './Collectibles';

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

  const linked = user?.linkedAccounts?.find(
    (a) => a.type === 'wallet' && (a as { chainType?: string }).chainType === 'solana'
  ) as { address?: string } | undefined;
  const walletAddress = wallets[0]?.address ?? linked?.address;

  if (!walletAddress) return null;

  return (
    <div className="mt-8 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6">
      <h2 className="font-display text-lg font-semibold text-white">Your collection</h2>
      <p className="mt-1 text-xs text-slate-500">
        cNFTs owned by your wallet — claimed heroes and SuperVictor Trophies.
      </p>
      <div className="mt-4">
        <Collectibles walletAddress={walletAddress} />
      </div>
    </div>
  );
}
