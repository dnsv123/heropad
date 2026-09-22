import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';

import { getOwnedCollectibles } from '../lib/helius.js';
import { prepareTransfer, sendPreparedTransfer, TransferError } from '../lib/transfer.js';
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

// Every cache miss here fans out to Privy + Helius DAS + Supabase, and the
// DAS key is rate-limited for the whole platform — so one account refreshing
// in a loop could starve everyone else. This was the last unlimited router.
userRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        ok: false,
        error: 'rate_limited',
        message: 'Too many requests. Please slow down.',
      });
    },
  })
);

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

// Moving a trophy to another wallet — two steps, see lib/transfer.ts.
// ---------------------------------------------------------------------------
// POST /api/user/transfer/prepare { assetId, to }  → half-signed transaction
// POST /api/user/transfer/send    { transaction, lastValidBlockHeight, wallet }
//                                                  → confirmed signature
// Both need a session; prepare also checks the trophy sits in one of the
// caller's own wallets, so nobody can build a transfer for someone else's
// asset (the owner's signature would be missing anyway, but the refusal
// should be a clear 403, not a cryptic failure in the browser).

const transferLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ ok: false, error: 'rate_limited', message: 'Too many moves this hour.' });
  },
});

function transferErrorStatus(code: TransferError['code']): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'not_your_trophy':
    case 'not_our_tree':
      return 403;
    default:
      return 400;
  }
}

userRouter.post('/transfer/prepare', transferLimiter, requireAuth, async (req: Request, res: Response) => {
  const privyId = (req as AuthedRequest).privyId as string;
  const body = (req.body ?? {}) as { assetId?: unknown; to?: unknown };
  const assetId = typeof body.assetId === 'string' ? body.assetId.trim() : '';
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!assetId || !to) {
    return res.status(400).json({ ok: false, error: 'bad_request', message: 'assetId and to are required.' });
  }

  let wallets: string[];
  try {
    wallets = await getUserSolanaWallets(privyId);
  } catch (err) {
    console.error('[user.transfer] privy lookup failed:', (err as Error).message);
    return res.status(502).json({ ok: false, error: 'auth_lookup_failed', message: 'Could not verify your wallet.' });
  }

  try {
    const prepared = await prepareTransfer(wallets, assetId, to);
    return res.status(200).json({ ok: true, ...prepared });
  } catch (err) {
    if (err instanceof TransferError) {
      return res.status(transferErrorStatus(err.code)).json({ ok: false, error: err.code, message: err.message });
    }
    console.error('[user.transfer.prepare] error:', (err as Error).message);
    return res.status(500).json({ ok: false, error: 'server_error', message: 'Could not prepare the move.' });
  }
});

userRouter.post('/transfer/send', transferLimiter, requireAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { transaction?: unknown; lastValidBlockHeight?: unknown; wallet?: unknown };
  const transaction = typeof body.transaction === 'string' ? body.transaction : '';
  const lastValid = Number(body.lastValidBlockHeight);
  if (!transaction || !Number.isFinite(lastValid)) {
    return res.status(400).json({ ok: false, error: 'bad_request', message: 'transaction and lastValidBlockHeight are required.' });
  }

  try {
    const signature = await sendPreparedTransfer(transaction, lastValid);
    // The collection changed; the next profile load must not serve the old one.
    if (typeof body.wallet === 'string') cache.delete(`me:${body.wallet}`);
    return res.status(200).json({ ok: true, signature });
  } catch (err) {
    if (err instanceof TransferError) {
      return res.status(transferErrorStatus(err.code)).json({ ok: false, error: err.code, message: err.message });
    }
    console.error('[user.transfer.send] error:', (err as Error).message);
    return res.status(502).json({ ok: false, error: 'send_failed', message: 'The move did not go through.' });
  }
});
