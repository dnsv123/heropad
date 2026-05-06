import { mintV1, parseLeafFromMintV1Transaction } from '@metaplex-foundation/mpl-bubblegum';
import { publicKey } from '@metaplex-foundation/umi';

import { getAdminUmi } from './solana-admin.js';
import { getSolanaConfig } from './supabase-admin.js';

// Bubblegum cNFT minting.
// -----------------------
// HeroPad mints into a single Merkle tree owned by the admin keypair. The tree
// address is created once (scripts/create-tree.ts), saved in `solana_config`,
// and reused for every claim.
//
// `mintCnftToWallet` takes the metadata + recipient and returns the asset ID
// (which is what wallets / explorers use to look the cNFT up).

const TREE_CONFIG_KEY = 'bubblegum_tree';

/** Reads the configured Bubblegum tree address. Throws if not initialized. */
export async function getBubblegumTreeAddress(): Promise<string> {
  // Allow override via env for emergency / local-only testing.
  if (process.env.BUBBLEGUM_TREE_ADDRESS) {
    return process.env.BUBBLEGUM_TREE_ADDRESS;
  }
  const stored = await getSolanaConfig(TREE_CONFIG_KEY);
  if (!stored) {
    throw new Error(
      '[Bubblegum] No tree address configured. Run `tsx apps/api/scripts/create-tree.ts` once to create one.'
    );
  }
  return stored;
}

export interface MintCnftInput {
  recipient: string; // Solana wallet address (base58)
  name: string;
  symbol?: string;
  uri: string; // Off-chain metadata JSON URL (Pinata / Arweave / our own R2)
  /**
   * Secondary-sale royalty in basis points (0–10000). Default 500 = 5%.
   * Marketplace honoring royalty enforcement (Magic Eden default, Tensor,
   * Hyperspace) will pay this share back to the creator address on every resale.
   * Set to 0 if you want no royalty (e.g. for free-distribution drops).
   */
  sellerFeeBasisPoints?: number;
}

// HeroPad standard royalty: 5% to the SuperVictor Universe creator wallet on
// every secondary sale. Aligns with industry default for collectibles.
const DEFAULT_SELLER_FEE_BPS = 500;

export interface MintCnftResult {
  /** Asset ID — the cNFT identifier wallets use. */
  assetId: string;
  /** Solana transaction signature (for Explorer link). */
  signature: string;
}

/**
 * Mints a single compressed NFT into the configured tree, transferred to
 * `recipient`. Returns asset ID + tx signature.
 *
 * Errors bubble up — the caller decides how to surface them (typically the
 * claim endpoint maps them to a 500 with a "mint failed" message).
 */
export async function mintCnftToWallet(input: MintCnftInput): Promise<MintCnftResult> {
  const umi = getAdminUmi();
  const treeAddr = await getBubblegumTreeAddress();

  const builder = mintV1(umi, {
    leafOwner: publicKey(input.recipient),
    merkleTree: publicKey(treeAddr),
    metadata: {
      name: input.name,
      symbol: input.symbol ?? 'HEROPAD',
      uri: input.uri,
      sellerFeeBasisPoints: input.sellerFeeBasisPoints ?? DEFAULT_SELLER_FEE_BPS,
      collection: { key: publicKey('11111111111111111111111111111111'), verified: false },
      creators: [
        {
          address: umi.identity.publicKey,
          verified: true,
          share: 100,
        },
      ],
    },
  });

  // Send + confirm. Bubblegum mints land in ~1–2s on Helius devnet.
  const { signature } = await builder.sendAndConfirm(umi, {
    confirm: { commitment: 'confirmed' },
  });

  // Parse the signed tx to get the leaf (asset ID).
  const leaf = await parseLeafFromMintV1Transaction(umi, signature);
  return {
    assetId: leaf.id.toString(),
    signature: Buffer.from(signature).toString('base64'),
  };
}
