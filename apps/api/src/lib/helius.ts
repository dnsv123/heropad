// Helius DAS (Digital Asset Standard) client.
// -------------------------------------------
// We use Helius' getAssetsByOwner JSON-RPC to enumerate the cNFTs a wallet
// owns. The same RPC URL we use for transactions doubles as the DAS endpoint,
// so no extra config — SOLANA_RPC_URL covers both.
//
// We ALWAYS filter results down to assets that live in our Bubblegum tree.
// That way a user who happens to own random cNFTs from other apps doesn't see
// them in their HeroPad profile, and we don't accidentally render an image
// from a hostile metadata URL.

import { getBubblegumTreeAddress } from './metaplex.js';

interface DasAsset {
  id: string;
  compression?: {
    compressed?: boolean;
    tree?: string;
    leaf_id?: number;
  };
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      attributes?: Array<{ trait_type?: string; value?: string }>;
    };
    files?: Array<{ uri?: string; mime?: string; cdn_uri?: string }>;
    links?: { image?: string; external_url?: string };
    json_uri?: string;
  };
  ownership?: { owner?: string };
  royalty?: { basis_points?: number };
}

export interface CollectibleSummary {
  /** Asset (mint) id — used in Solana Explorer URLs. */
  assetId: string;
  /** Display name — e.g. "Super Victor — 8YF5". */
  name: string;
  symbol: string;
  /** Best image URL we can find (CDN preferred, falls back to JSON-declared). */
  imageUrl: string | null;
  /** Optional one-liner from metadata. */
  description: string | null;
  /** Royalty in basis points (0–10000). */
  royaltyBps: number;
  /** Off-chain metadata JSON URL — useful for debugging. */
  jsonUri: string | null;
  /** Trait list, normalized. */
  attributes: Array<{ trait: string; value: string }>;
}

function getRpcUrl(): string {
  const url = process.env.SOLANA_RPC_URL ?? process.env.VITE_SOLANA_RPC_URL;
  if (!url) {
    throw new Error('[Helius] SOLANA_RPC_URL not configured.');
  }
  return url;
}

/**
 * Calls Helius DAS getAssetsByOwner and returns only cNFTs that live in OUR
 * Bubblegum tree. Returns up to 100 by default — enough for hackathon scale.
 */
export async function getOwnedCollectibles(
  ownerAddress: string,
  limit = 100
): Promise<CollectibleSummary[]> {
  const treeAddr = await getBubblegumTreeAddress();

  const res = await fetch(getRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'heropad-collectibles',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress,
        page: 1,
        limit,
        // Show full content (metadata + files) and use Helius' image CDN.
        displayOptions: { showCollectionMetadata: false },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`[Helius] getAssetsByOwner ${res.status}`);
  }
  const json = (await res.json()) as { result?: { items?: DasAsset[] } };
  const items = json.result?.items ?? [];

  // Keep only cNFTs from our tree. Drops random/hostile assets.
  const ours = items.filter(
    (a) => a.compression?.compressed === true && a.compression?.tree === treeAddr
  );

  return ours.map<CollectibleSummary>((a) => {
    const meta = a.content?.metadata ?? {};
    const file = a.content?.files?.[0];
    const imageUrl = file?.cdn_uri ?? a.content?.links?.image ?? file?.uri ?? null;
    return {
      assetId: a.id,
      name: meta.name ?? 'Untitled HeroPad',
      symbol: meta.symbol ?? 'HEROPAD',
      imageUrl,
      description: meta.description ?? null,
      royaltyBps: a.royalty?.basis_points ?? 0,
      jsonUri: a.content?.json_uri ?? null,
      attributes: (meta.attributes ?? [])
        .filter((x) => x.trait_type && x.value)
        .map((x) => ({ trait: x.trait_type as string, value: String(x.value) })),
    };
  });
}
