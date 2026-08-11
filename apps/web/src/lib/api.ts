// Tiny typed fetch wrapper for talking to the HeroPad API.
// We keep it minimal — no axios, no swr, just fetch + types.
//
// Base URL comes from VITE_API_BASE_URL. Defaulting to http://localhost:8787
// makes the dev experience seamless: run `npm run dev:api` in one terminal,
// `npm run dev:web` in another, and the frontend talks to the local backend.

import type { ClaimRequest, ClaimResponse, ApiError } from '@heropad/shared';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8787';

/**
 * Stronger error type returned by the API. Carries the machine-readable
 * `error` code (used by callers to render targeted UI) plus the human message.
 */
export interface ApiCallError extends Error {
  code: string;
  status: number;
}

function makeApiError(message: string, code: string, status: number): ApiCallError {
  const err = new Error(message) as ApiCallError;
  err.code = code;
  err.status = status;
  return err;
}

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure — backend not reachable, CORS preflight blocked, etc.
    throw makeApiError(
      `Cannot reach the HeroPad API at ${API_BASE_URL}. Is the backend running?`,
      'network_error',
      0
    );
  }

  // Try to parse JSON either way — most error responses include { error, message }.
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* response was not JSON, fall through */
  }

  if (!res.ok) {
    const errBody = (data as Partial<ApiError>) ?? {};
    throw makeApiError(
      errBody.message ?? `Request failed with ${res.status}`,
      errBody.error ?? 'unknown_error',
      res.status
    );
  }

  return data as TRes;
}

async function getJson<TRes>(path: string, token?: string): Promise<TRes> {
  let res: Response;
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { headers });
  } catch {
    throw makeApiError(
      `Cannot reach the HeroPad API at ${API_BASE_URL}.`,
      'network_error',
      0
    );
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* not json */
  }
  if (!res.ok) {
    const errBody = (data as Partial<ApiError>) ?? {};
    throw makeApiError(
      errBody.message ?? `Request failed with ${res.status}`,
      errBody.error ?? 'unknown_error',
      res.status
    );
  }
  return data as TRes;
}

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

export interface UserMeResponse {
  ok: true;
  wallet: string;
  bits: { current: number; earned: number; spent: number };
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
