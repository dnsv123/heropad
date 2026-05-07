/* eslint-disable no-console */
// One-shot script: create a Bubblegum Merkle tree and persist its address.
// ------------------------------------------------------------------------
// Run once per environment (devnet / mainnet) before any claim can mint.
//
// Usage from repo root:
//   tsx apps/api/scripts/create-tree.ts
//
// Sizing for HeroPad v1:
//   maxDepth = 14, maxBufferSize = 64
//   → up to 2^14 = 16,384 cNFTs in this tree
//   → ~0.06 SOL one-time storage rent on devnet (free with airdrop)
//
// Idempotency: if `solana_config.bubblegum_tree` is already set, the script
// asks for confirmation before creating a new tree. This avoids accidental
// orphaning of an existing tree.

// Resolve .env from repo root regardless of where the script is invoked from.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../../.env'), override: true });

import { createTree } from '@metaplex-foundation/mpl-bubblegum';
import { generateSigner } from '@metaplex-foundation/umi';

import { getAdminUmi, getAdminPublicKey } from '../src/lib/solana-admin.js';
import { getSolanaConfig, setSolanaConfig } from '../src/lib/supabase-admin.js';

const MAX_DEPTH = 14;
const MAX_BUFFER_SIZE = 64;

async function main() {
  console.log('=== HeroPad — Bubblegum tree bootstrap ===');
  console.log('Admin pubkey :', getAdminPublicKey());
  console.log('Tree size    : depth=%d, buffer=%d (capacity ≈ %d cNFTs)',
    MAX_DEPTH, MAX_BUFFER_SIZE, 2 ** MAX_DEPTH);

  // Don't silently overwrite an existing tree.
  const existing = await getSolanaConfig('bubblegum_tree');
  if (existing) {
    console.log('\n⚠️  A tree address is already configured: %s', existing);
    console.log('   To replace it, manually delete the row in solana_config first.');
    process.exit(1);
  }

  const umi = getAdminUmi();
  const merkleTree = generateSigner(umi);

  console.log('\nNew tree address (will be created): %s', merkleTree.publicKey);
  console.log('Submitting createTree transaction…');

  const builder = await createTree(umi, {
    merkleTree,
    maxDepth: MAX_DEPTH,
    maxBufferSize: MAX_BUFFER_SIZE,
    // public = true means anyone can mint into the tree if they have the right
    // collection authority. We keep it false so only the admin keypair mints.
    public: false,
  });

  const { signature } = await builder.sendAndConfirm(umi, {
    confirm: { commitment: 'confirmed' },
  });

  const sigBase64 = Buffer.from(signature).toString('base64');
  console.log('✓ Tree created. Tx signature (base64):', sigBase64);

  // Persist for future claims.
  await setSolanaConfig('bubblegum_tree', merkleTree.publicKey.toString());
  console.log('✓ Tree address saved to solana_config.bubblegum_tree');
  console.log('\nDone. You can now POST /api/claim and mints will land in this tree.');
}

main().catch((err) => {
  console.error('✗ Tree creation failed:', err);
  process.exit(1);
});
