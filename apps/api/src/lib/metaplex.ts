import {
  mintV1,
  parseLeafFromMintV1Transaction,
  fetchMerkleTree,
  findLeafAssetIdPda,
} from '@metaplex-foundation/mpl-bubblegum';
import { publicKey } from '@metaplex-foundation/umi';
import bs58 from 'bs58';

import { getAdminUmi } from './solana-admin.js';
import { getSolanaConfig } from './supabase-admin.js';

// Bubblegum cNFT minting.
// -----------------------
// HeroPad mints into a single Merkle tree owned by the admin keypair. The tree
// address is created once (scripts/create-tree.ts), saved in `solana_config`,
// and reused for every claim.
//
// `mintCnftToWallet` takes the metadata + recipient and returns the asset ID.
// Two paths to obtain the asset ID:
//   1. parseLeafFromMintV1Transaction(umi, signature) — fast, but brittle
//      against RPC log-format quirks. Will throw "Could not parse leaf" on
//      certain Helius / public-RPC responses.
//   2. Fallback: fetch the tree state, read sequenceNumber, derive the leaf
//      PDA. Costs one extra RPC call but is bulletproof.

const TREE_CONFIG_KEY = 'bubblegum_tree';

/** Reads the configured Bubblegum tree address. Throws if not initialized. */
export async function getBubblegumTreeAddress(): Promise<string> {
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
  recipient: string;
  name: string;
  symbol?: string;
  uri: string;
  /**
   * Secondary-sale royalty in basis points (0–10000). Default 500 = 5%.
   */
  sellerFeeBasisPoints?: number;
}

const DEFAULT_SELLER_FEE_BPS = 500;

export interface MintCnftResult {
  /** Asset ID — the cNFT identifier wallets / explorers use. */
  assetId: string;
  /** Solana transaction signature, base58 (Explorer-friendly). */
  signature: string;
}

export async function mintCnftToWallet(input: MintCnftInput): Promise<MintCnftResult> {
  const umi = getAdminUmi();
  const treeAddr = await getBubblegumTreeAddress();
  const treePk = publicKey(treeAddr);

  const builder = mintV1(umi, {
    leafOwner: publicKey(input.recipient),
    merkleTree: treePk,
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

  const { signature } = await builder.sendAndConfirm(umi, {
    confirm: { commitment: 'confirmed' },
  });

  // Solana tx signatures are 64 bytes; explorers want them base58.
  const sigBase58 = bs58.encode(signature);

  // 1. Try the canonical parser first — it's a single call when it works.
  let assetId: string | null = null;
  try {
    const leaf = await parseLeafFromMintV1Transaction(umi, signature);
    assetId = leaf.id.toString();
  } catch (parseErr) {
    // eslint-disable-next-line no-console
    console.warn(
      '[Bubblegum] parseLeafFromMintV1Transaction failed, deriving from tree state:',
      (parseErr as Error).message
    );
  }

  // 2. Fallback — read tree state, derive asset ID from the latest leaf index.
  // After our mint, the tree's sequenceNumber == previous + 1. Our new leaf
  // sits at index (sequenceNumber - 1).
  if (!assetId) {
    const treeAccount = await fetchMerkleTree(umi, treePk);
    // The tree header lives at `treeAccount.tree`; field name is `sequenceNumber`
    // (bigint). For freshly minted leaves we want sequenceNumber - 1.
    const seq = (treeAccount.tree as unknown as { sequenceNumber: bigint })
      .sequenceNumber;
    const leafIndex = Number(seq) - 1;
    if (leafIndex < 0) {
      throw new Error('[Bubblegum] Tree sequenceNumber is 0 after mint — cannot derive asset id.');
    }
    const [assetIdPk] = findLeafAssetIdPda(umi, {
      merkleTree: treePk,
      leafIndex,
    });
    assetId = assetIdPk.toString();
  }

  return { assetId, signature: sigBase58 };
}
