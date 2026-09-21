import { Connection, Keypair } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity } from '@metaplex-foundation/umi';
import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import bs58 from 'bs58';

// Solana admin context for HeroPad backend.
// -----------------------------------------
// We keep ONE long-lived keypair (the "admin") that:
//   1. Owns the Bubblegum Merkle tree we mint into.
//   2. Pays mint fees on devnet (~free with airdropped SOL).
//   3. Is never exposed to the frontend or to user-provided URLs.
//
// The private key arrives as base58 in SOLANA_ADMIN_PRIVATE_KEY (preferred),
// or as a JSON-array of bytes if pasted from a `solana-keygen` file.
// We support both formats so devs can swap in either without re-encoding.

let cachedKeypair: Keypair | null = null;
let cachedConnection: Connection | null = null;
let cachedUmi: ReturnType<typeof createUmi> | null = null;

/** Returns the configured Solana RPC URL (Helius devnet by default). */
function getRpcUrl(): string {
  const url = process.env.SOLANA_RPC_URL ?? process.env.VITE_SOLANA_RPC_URL;
  if (!url) {
    throw new Error(
      '[Solana] SOLANA_RPC_URL is not set. Use a Helius / QuickNode / public devnet endpoint.'
    );
  }
  return url;
}

/**
 * Which cluster the RPC URL points at, from its hostname. Helius encodes it
 * as a subdomain (devnet.helius-rpc.com / mainnet.helius-rpc.com); public
 * endpoints say it in the host too.
 */
export function rpcCluster(): 'devnet' | 'mainnet' | 'unknown' {
  let host: string;
  try {
    host = new URL(getRpcUrl()).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (host.includes('devnet')) return 'devnet';
  if (host.includes('mainnet')) return 'mainnet';
  return 'unknown';
}

/** Long-lived RPC Connection (web3.js). Cached across requests. */
export function getAdminConnection(): Connection {
  if (!cachedConnection) {
    cachedConnection = new Connection(getRpcUrl(), 'confirmed');
  }
  return cachedConnection;
}

/**
 * Loads the admin Keypair from SOLANA_ADMIN_PRIVATE_KEY.
 * Accepts either:
 *   - Base58 string (preferred, 88 chars) — `solana-keygen pubkey ... | bs58`
 *   - JSON array string `[1,2,3,...]` (64 bytes) — output of `solana-keygen new`
 *
 * The keypair is cached. NEVER logs the secret.
 */
export function loadAdminKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;

  const raw = process.env.SOLANA_ADMIN_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      '[Solana] SOLANA_ADMIN_PRIVATE_KEY is not set. Generate one with `solana-keygen new` and put the base58 secret here.'
    );
  }

  let secretBytes: Uint8Array;
  const trimmed = raw.trim();

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    // JSON array of bytes (legacy solana-keygen format).
    try {
      const arr = JSON.parse(trimmed) as number[];
      if (!Array.isArray(arr) || arr.length !== 64) {
        throw new Error('Expected 64 bytes');
      }
      secretBytes = Uint8Array.from(arr);
    } catch (err) {
      throw new Error(`[Solana] SOLANA_ADMIN_PRIVATE_KEY JSON parse failed: ${(err as Error).message}`);
    }
  } else {
    // Base58 string.
    try {
      secretBytes = bs58.decode(trimmed);
      if (secretBytes.length !== 64) {
        throw new Error(`Expected 64 bytes after base58 decode, got ${secretBytes.length}`);
      }
    } catch (err) {
      throw new Error(`[Solana] SOLANA_ADMIN_PRIVATE_KEY base58 decode failed: ${(err as Error).message}`);
    }
  }

  cachedKeypair = Keypair.fromSecretKey(secretBytes);
  // Sanity log — public key only, never the secret.
  console.log(`[Solana] Admin keypair loaded: ${cachedKeypair.publicKey.toBase58()}`);
  return cachedKeypair;
}

/** Public address of the admin (safe to log / display). */
export function getAdminPublicKey(): string {
  return loadAdminKeypair().publicKey.toBase58();
}

/**
 * Umi instance configured with the admin identity + Bubblegum plugin.
 * Used for cNFT minting via @metaplex-foundation/mpl-bubblegum.
 */
export function getAdminUmi() {
  if (!cachedUmi) {
    const kp = loadAdminKeypair();
    const umi = createUmi(getRpcUrl()).use(mplBubblegum());
    // Convert web3.js Keypair → Umi keypair.
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(kp.secretKey);
    umi.use(keypairIdentity(umiKeypair));
    cachedUmi = umi;
  }
  return cachedUmi;
}
