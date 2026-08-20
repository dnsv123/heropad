// Claim-flow endpoints.
// ---------------------------------------------------------------------------
// This file used to carry its own fetch wrapper, which is how the profile
// collection broke: that wrapper had no way to attach an Authorization header,
// so when /api/user/me became authenticated the caller kept sending anonymous
// requests and every customer saw "could not load your collection".
//
// The transport now lives in services/apiClient — one place that knows about
// tokens and error shapes. What remains here is the claim-flow surface and its
// types, so existing imports keep working.

import type { ClaimRequest, ClaimResponse } from '@heropad/shared';

import { getJson, postJson, type ApiClientError } from '../services/apiClient';

/**
 * Error thrown by every call here. Carries the machine-readable `code` (used by
 * callers to render targeted UI) plus the human message.
 *
 * Kept as an alias so the two names cannot describe two different shapes again.
 */
export type ApiCallError = ApiClientError;

// --- Endpoints --------------------------------------------------------------

export interface ClaimApiInput extends ClaimRequest {
  walletAddress: string;
}

export type ClaimApiOutput = ClaimResponse & {
  txSignature: string;
};

export function postClaim(input: ClaimApiInput): Promise<ClaimApiOutput> {
  return postJson<ClaimApiInput, ClaimApiOutput>('/api/claim', input);
}

export interface CollectibleSummary {
  assetId: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  description: string | null;
  royaltyBps: number;
  jsonUri: string | null;
  attributes: Array<{ trait: string; value: string }>;
}

export interface BitsHistoryEntry {
  amount: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface UserMeResponse {
  ok: true;
  wallet: string;
  bits: { current: number; earned: number; spent: number };
  bitsHistory: BitsHistoryEntry[];
  collectibles: CollectibleSummary[];
  collectibleCount: number;
  cached: boolean;
}

/**
 * `/api/user/me` is authenticated — the API checks the Privy token owns the
 * wallet it is asked about, so a token is required, not optional in practice.
 */
export function getUserMe(walletAddress: string, token: string): Promise<UserMeResponse> {
  const qs = new URLSearchParams({ wallet: walletAddress }).toString();
  return getJson<UserMeResponse>(`/api/user/me?${qs}`, token);
}
