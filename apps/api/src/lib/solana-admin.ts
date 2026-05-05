import { Connection, Keypair } from '@solana/web3.js';

// TODO: load admin keypair from SOLANA_ADMIN_PRIVATE_KEY (base58 or JSON array).
// NEVER log the private key. Only the public key is safe to expose.
export function getAdminConnection(): Connection {
  const url = process.env.VITE_SOLANA_RPC_URL ?? process.env.SOLANA_RPC_URL;
  if (!url) {
    throw new Error('Solana RPC URL not configured');
  }
  return new Connection(url, 'confirmed');
}

export function loadAdminKeypair(): Keypair {
  // TODO: parse SOLANA_ADMIN_PRIVATE_KEY safely (try base58 first, then JSON array).
  throw new Error('loadAdminKeypair not implemented');
}
