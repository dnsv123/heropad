import { Router, type Request, type Response } from 'express';

import { getOwnedCollectibles } from '../lib/helius.js';
import { getBitsBalance, getBitsHistory } from '../lib/supabase-admin.js';
import {
  requireAuth,
  getUserSolanaWallets,
  type AuthedRequest,
} from '../middleware/auth.js';
import { queryString } from '../lib/query.js';

// GET /api/user/me?wallet=<address>
// ---------------------------------
// Returns everything the Profile widget needs:
//   - BITS balance (from Supabase)
//   - Owned cNFTs (from Helius DAS, filtered to our Bubblegum tree)
//
// Why a single endpoint: keeps the frontend round-trip count to one and lets
// us cache responses cheaply. The frontend renders a loading state once and
// then resolves the whole profile from a single payload.
//
// Caching: an in-memory Map with 60s TTL. For hackathon scale this is fine;
// production would use Redis / Upstash. Helius DAS rate limits live around
// 10 req/s per key — caching protects us if a user spams refresh.

export const userRouter = Router();

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
// Short TTL during development so users see new claims promptly. Bump to
// 60_000+ for production scale once we add an explicit "refresh" button.
const TTL_MS = 10_000;

function getCached(key: string): unknown {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

userRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const privyId = (req as AuthedRequest).privyId as string;

  // The wallet is DERIVED from the verified session, never trusted from the
  // request: on-chain addresses are public, so accepting one from the client
  // would let anybody read anyone else's balance and collection.
  let wallets: string[];
  try {
    wallets = await getUserSolanaWallets(privyId);
  } catch (err) {
    console.error('[user.me] privy lookup failed:', (err as Error).message);
    return res.status(502).json({
      ok: false,
      error: 'auth_lookup_failed',
      message: 'Could not verify your wallet. Please try again.',
    });
  }

  // A caller may ask for a specific one of THEIR wallets; anything else is
  // rejected. With no hint we default to the first linked wallet.
  const requested = queryString(req.query.wallet).trim();
  const wallet = requested || wallets[0];
  if (!wallet) {
    return res.status(404).json({
      ok: false,
      error: 'no_wallet',
      message: 'No Solana wallet linked to this account yet.',
    });
  }
  if (!wallets.includes(wallet)) {
    return res.status(403).json({
      ok: false,
      error: 'not_your_wallet',
      message: 'That wallet does not belong to your account.',
    });
  }

  const cacheKey = `me:${wallet}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.status(200).json({ ok: true, ...(cached), cached: true });
  }

  try {
    const [bits, collectibles, bitsHistory] = await Promise.all([
      getBitsBalance(wallet),
      getOwnedCollectibles(wallet),
      getBitsHistory(wallet),
    ]);

    const payload = {
      wallet,
      bits,
      bitsHistory,
      collectibles,
      collectibleCount: collectibles.length,
    };

    setCached(cacheKey, payload);
    return res.status(200).json({ ok: true, ...payload, cached: false });
  } catch (err) {
    console.error('[user.me] error:', (err as Error).message);
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: 'Could not load profile data.',
    });
  }
});
