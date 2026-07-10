import { useSolanaWallets } from '@privy-io/react-auth/solana';

import Collectibles from './Collectibles';

// Profile → Your collection. Wraps the existing Collectibles widget (BITS +
// cNFT grid from Helius) under its own heading — trophies land here
// automatically since they're minted into the same collection.

export default function CollectionCard() {
  const { wallets, ready } = useSolanaWallets();
  const walletAddress = wallets[0]?.address;

  if (!ready || !walletAddress) return null;

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
