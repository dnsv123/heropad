// Shared types between apps/web and apps/api.
// TODO: keep this file as the single source of truth for cross-process contracts.

export type CollectibleType = 'figurine_nfc' | 'card_qr' | 'pack_qr';

export type DistributionChannel = 'b2c_shopify' | 'b2b_social' | 'event' | 'other';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface VDashStats {
  speed: number;
  jump: number;
  power: number;
  // TODO: extend once V-DASH gameplay is finalized.
}

export interface ClaimRequest {
  code: string;
  signature: string;
  deviceId?: string;
  scanMethod: 'nfc' | 'qr_card' | 'qr_pack';
}

export interface ClaimResponse {
  ok: true;
  cnftMintAddress: string;
  bitsAwarded: number;
}

export interface ApiError {
  ok: false;
  error: string;
  message?: string;
}
