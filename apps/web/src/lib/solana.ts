// TODO: build a thin Solana client (devnet) used by the frontend for read-only ops.
// Mints/transfers go through the API — never sign with admin keys client-side.

import { Connection } from '@solana/web3.js';

export function getSolanaConnection(): Connection {
  const url = import.meta.env.VITE_SOLANA_RPC_URL as string | undefined;
  if (!url) {
    throw new Error('VITE_SOLANA_RPC_URL is not configured');
  }
  return new Connection(url, 'confirmed');
}
