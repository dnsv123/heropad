import { Router, type Request, type Response } from 'express';

import { getOwnedCollectibles } from '../lib/helius.js';
import { getBitsBalance } from '../lib/supabase-admin.js';

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

function getCached(key: string): unknown | null {
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

userRouter.get('/me', async (req: Request, res: Response) => {
  const wallet = String(req.query.wallet ?? '').trim();
  if (!wallet || wallet.length < 32 || wallet.length > 44) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_wallet',
      message: 'Provide ?wallet=<base58 Solana address>',
    });
  }

  const cacheKey = `me:${wallet}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.status(200).json({ ok: true, ...(cached as object), cached: true });
  }

  try {
    const [bits, collectibles] = await Promise.all([
      getBitsBalance(wallet),
      getOwnedCollectibles(wallet),
    ]);

    const payload = {
      wallet,
      bits,
      collectibles,
      collectibleCount: collectibles.length,
    };

    setCached(cacheKey, payload);
    return res.status(200).json({ ok: true, ...payload, cached: false });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[user.me] error:', (err as Error).message);
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: 'Could not load profile data.',
    });
  }
});
