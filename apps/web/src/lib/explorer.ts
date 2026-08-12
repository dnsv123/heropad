// Solana explorer links, in one place.
// ---------------------------------------------------------------------------
// The cluster used to be written into each link by hand, in four components. On
// the day we move to mainnet, three of those would have been found and one
// would not — and a link pointing at the wrong cluster does not fail loudly, it
// says "transaction not found", which reads to a customer as a lost trophy.
//
// Set VITE_SOLANA_CLUSTER=mainnet-beta on Vercel to switch everything at once.
// Mainnet links carry no cluster parameter at all, which is what the explorer
// itself expects.

export type Cluster = 'devnet' | 'testnet' | 'mainnet-beta';

export function solanaCluster(): Cluster {
  const raw = (import.meta.env.VITE_SOLANA_CLUSTER as string | undefined)?.trim().toLowerCase();
  if (raw === 'mainnet' || raw === 'mainnet-beta') return 'mainnet-beta';
  if (raw === 'testnet') return 'testnet';
  return 'devnet';
}

function suffix(): string {
  const c = solanaCluster();
  return c === 'mainnet-beta' ? '' : `?cluster=${c}`;
}

/** Explorer page for a cNFT / account address. */
export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}${suffix()}`;
}

/** Explorer page for a transaction signature. */
export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${suffix()}`;
}
