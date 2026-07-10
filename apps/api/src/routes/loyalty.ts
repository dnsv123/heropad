import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { mintCnftToWallet } from '../lib/metaplex.js';
import { creditBits } from '../lib/supabase-admin.js';
import {
  getVenueBySlug,
  claimVenueOwnership,
  ensureIdentity,
  findIdentityByCode,
  getIdentityById,
  getVenueProgress,
  countStampsToday,
  grantStamps,
  redeemReward,
  setRewardTrophy,
  createRedeemCode,
  findValidRedeemCode,
  markRedeemCodeUsed,
  getUserLoyaltyStats,
  getVenueAnalytics,
  type VenueRow,
} from '../lib/loyalty-db.js';

// Loyalty routes — the café stamp engine (validation phase).
// ---------------------------------------------------------------------------
// Security model:
//   - Stamps are granted ONLY by the venue owner (barista), never self-served.
//     The client page has no grant button; it only reads its own progress.
//   - All /me and /merchant endpoints sit behind requireAuth (verified Privy
//     token). Merchant endpoints additionally check venue ownership.
//   - Soft cap: max 10 stamps / user / venue / day (generous for real usage,
//     stops a compromised merchant session from mass-granting).
//   - Redeem happens on the MERCHANT device: the barista consumes the stamps
//     when handing over the reward, so free items only leave the counter with
//     merchant intent.

export const loyaltyRouter = Router();

loyaltyRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120, // client pages poll progress every few seconds — keep headroom
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

// Safety net, NOT a customer limit: a legit customer never hits it, but it
// bounds the damage a compromised/abusive merchant session can do in a day.
// Override via env while testing (LOYALTY_DAILY_CAP=100); becomes a per-venue
// merchant setting in the dashboard phase.
const MAX_STAMPS_PER_DAY = Number(process.env.LOYALTY_DAILY_CAP ?? 10);

const SLUG_RE = /^[a-z0-9-]{2,60}$/;
const CODE_RE = /^[A-Z2-9]{6}$/i;

// --- Shared helpers ----------------------------------------------------------

async function loadActiveVenue(
  slug: string,
  res: Response
): Promise<VenueRow | null> {
  if (!SLUG_RE.test(slug)) {
    res.status(400).json({ ok: false, error: 'bad_slug', message: 'Invalid venue slug.' });
    return null;
  }
  const venue = await getVenueBySlug(slug);
  if (!venue || !venue.active) {
    res.status(404).json({
      ok: false,
      error: 'unknown_venue',
      message: 'This venue is not on HeroPad (yet).',
    });
    return null;
  }
  return venue;
}

/** Loads the venue AND verifies the caller owns it. Sends the error response itself. */
async function loadOwnedVenue(
  slug: string,
  privyId: string,
  res: Response
): Promise<{ venue: VenueRow; merchantIdentityId: string } | null> {
  const venue = await loadActiveVenue(slug, res);
  if (!venue) return null;
  const identity = await ensureIdentity(privyId);
  if (!venue.owner_identity_id || venue.owner_identity_id !== identity.id) {
    res.status(403).json({
      ok: false,
      error: 'not_merchant',
      message: 'Your account is not the merchant of this venue.',
    });
    return null;
  }
  return { venue, merchantIdentityId: identity.id };
}

function serverError(res: Response, scope: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[loyalty.${scope}]`, (err as Error).message);
  res.status(500).json({
    ok: false,
    error: 'server_error',
    message: 'Something went wrong on our side. Please try again.',
  });
}

// --- Public ------------------------------------------------------------------

// GET /api/loyalty/venue/:slug — public venue card (no auth, no PII).
loyaltyRouter.get('/venue/:slug', async (req: Request, res: Response) => {
  try {
    const venue = await loadActiveVenue(req.params.slug, res);
    if (!venue) return;
    return res.status(200).json({
      ok: true,
      venue: {
        slug: venue.slug,
        name: venue.name,
        stampsRequired: venue.stamps_required,
        branding: venue.branding,
        hasOwner: Boolean(venue.owner_identity_id),
      },
    });
  } catch (err) {
    return serverError(res, 'venue', err);
  }
});

// --- Customer (authenticated) --------------------------------------------------

// GET /api/loyalty/me/stats — cross-venue loyalty footprint for the Profile
// page. MUST be registered before /me/:slug or "stats" is captured as a slug.
loyaltyRouter.get('/me/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const identity = await ensureIdentity(privyId);
    const stats = await getUserLoyaltyStats(identity.id);
    return res.status(200).json({ ok: true, ...stats });
  } catch (err) {
    return serverError(res, 'me-stats', err);
  }
});

// GET /api/loyalty/me/:slug — my code + my progress at this venue.
// The client page polls this; it's the single source of truth for the meter.
loyaltyRouter.get('/me/:slug', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const venue = await loadActiveVenue(req.params.slug, res);
    if (!venue) return;

    const wallet =
      typeof req.query.wallet === 'string' && req.query.wallet.length >= 32
        ? req.query.wallet
        : null;
    const identity = await ensureIdentity(privyId, wallet);
    const progress = await getVenueProgress(identity.id, venue.id);

    return res.status(200).json({
      ok: true,
      code: identity.loyalty_code,
      venue: { slug: venue.slug, name: venue.name },
      stamps: progress.current,
      required: venue.stamps_required,
      totalStamps: progress.totalStamps,
      cardsCompleted: progress.cardsCompleted,
      canRedeem: progress.current >= venue.stamps_required,
    });
  } catch (err) {
    return serverError(res, 'me', err);
  }
});

// POST /api/loyalty/me/:slug/redeem-code — the customer, on their OWN phone,
// generates a one-time code (5-min TTL) proving they are present. The barista
// types THIS code to redeem — the permanent loyalty code can no longer consume
// a card, closing the "merchant redeems while customer is absent" hole.
loyaltyRouter.post(
  '/me/:slug/redeem-code',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const venue = await loadActiveVenue(req.params.slug, res);
      if (!venue) return;

      const identity = await ensureIdentity(privyId);
      const progress = await getVenueProgress(identity.id, venue.id);
      if (progress.current < venue.stamps_required) {
        return res.status(409).json({
          ok: false,
          error: 'not_enough_stamps',
          message: `You have ${progress.current}/${venue.stamps_required} stamps.`,
        });
      }

      const rc = await createRedeemCode(identity.id, venue.id);
      return res.status(200).json({ ok: true, code: rc.code, expiresAt: rc.expires_at });
    } catch (err) {
      return serverError(res, 'redeem-code', err);
    }
  }
);

// POST /api/loyalty/venue/:slug/claim-ownership — validation-phase merchant
// bootstrap: the FIRST logged-in user to claim an unowned venue becomes its
// merchant. Idempotent-ish: re-claiming your own venue returns ok.
loyaltyRouter.post(
  '/venue/:slug/claim-ownership',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const venue = await loadActiveVenue(req.params.slug, res);
      if (!venue) return;

      const identity = await ensureIdentity(privyId);
      if (venue.owner_identity_id === identity.id) {
        return res.status(200).json({ ok: true, alreadyOwner: true });
      }
      if (venue.owner_identity_id) {
        return res.status(409).json({
          ok: false,
          error: 'already_owned',
          message: 'This venue already has a merchant account.',
        });
      }
      const claimed = await claimVenueOwnership(venue.id, identity.id);
      if (!claimed) {
        return res.status(409).json({
          ok: false,
          error: 'already_owned',
          message: 'Someone claimed this venue a moment ago.',
        });
      }
      return res.status(200).json({ ok: true, alreadyOwner: false });
    } catch (err) {
      return serverError(res, 'claim-ownership', err);
    }
  }
);

// --- Merchant (authenticated + owner) -----------------------------------------

// GET /api/loyalty/merchant/:slug/stats — the pilot merchant dashboard.
// Owner-only, PII-free: counts and trends, never emails or customer codes.
loyaltyRouter.get(
  '/merchant/:slug/stats',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;
      const analytics = await getVenueAnalytics(
        owned.venue.id,
        owned.venue.stamps_required
      );
      return res.status(200).json({ ok: true, ...analytics });
    } catch (err) {
      return serverError(res, 'merchant-stats', err);
    }
  }
);

// GET /api/loyalty/merchant/:slug/customer/:code — look up a customer by their
// personal code before granting. Returns progress only — never email/PII.
loyaltyRouter.get(
  '/merchant/:slug/customer/:code',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;

      if (!CODE_RE.test(req.params.code)) {
        return res.status(400).json({
          ok: false,
          error: 'bad_code',
          message: 'Customer code must be 6 letters/digits.',
        });
      }
      const customer = await findIdentityByCode(req.params.code);
      if (!customer) {
        return res.status(404).json({
          ok: false,
          error: 'unknown_code',
          message: 'No customer with this code. Ask them to check their loyalty page.',
        });
      }
      const progress = await getVenueProgress(customer.id, owned.venue.id);
      return res.status(200).json({
        ok: true,
        code: customer.loyalty_code,
        stamps: progress.current,
        required: owned.venue.stamps_required,
        cardsCompleted: progress.cardsCompleted,
        canRedeem: progress.current >= owned.venue.stamps_required,
      });
    } catch (err) {
      return serverError(res, 'customer', err);
    }
  }
);

const GrantBody = z.object({
  code: z.string().regex(CODE_RE, 'Customer code must be 6 letters/digits'),
  count: z.number().int().min(1).max(5),
});

// POST /api/loyalty/merchant/:slug/grant — the barista action. One request per
// purchase; count = number of coffees (1..5).
loyaltyRouter.post(
  '/merchant/:slug/grant',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;

      const parsed = GrantBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_body',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      const customer = await findIdentityByCode(parsed.data.code);
      if (!customer) {
        return res.status(404).json({
          ok: false,
          error: 'unknown_code',
          message: 'No customer with this code.',
        });
      }

      const today = await countStampsToday(customer.id, owned.venue.id);
      if (today + parsed.data.count > MAX_STAMPS_PER_DAY) {
        return res.status(429).json({
          ok: false,
          error: 'daily_cap',
          message: `Daily cap reached (${MAX_STAMPS_PER_DAY} stamps/day per customer).`,
        });
      }

      await grantStamps({
        identityId: customer.id,
        venueId: owned.venue.id,
        count: parsed.data.count,
        grantedBy: owned.merchantIdentityId,
        source: 'merchant',
      });

      const progress = await getVenueProgress(customer.id, owned.venue.id);
      return res.status(200).json({
        ok: true,
        granted: parsed.data.count,
        stamps: progress.current,
        required: owned.venue.stamps_required,
        canRedeem: progress.current >= owned.venue.stamps_required,
      });
    } catch (err) {
      return serverError(res, 'grant', err);
    }
  }
);

const RedeemBody = z.object({
  redeemCode: z.string().regex(CODE_RE, 'Redeem code must be 6 letters/digits'),
});

/**
 * Trophy metadata for the collectible cNFT minted at redemption. Off-chain
 * JSON is a static file served by the web app; the on-chain name carries the
 * venue + edition so each trophy is individually identifiable.
 */
function trophyUri(): string {
  return (
    process.env.TROPHY_METADATA_URI ?? 'https://heropad.vercel.app/cnft/trophy.json'
  );
}

// POST /api/loyalty/merchant/:slug/redeem — barista types the customer's
// ONE-TIME redeem code (generated seconds ago on the customer's phone → proof
// of presence), the card is consumed, and a SuperVictor Trophy cNFT is minted
// to the customer's wallet via the existing Bubblegum pipeline. The mint is
// best-effort: a devnet/RPC hiccup must never block handing over the coffee.
loyaltyRouter.post(
  '/merchant/:slug/redeem',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;

      const parsed = RedeemBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_body',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      // 1. Resolve the one-time code (unused + unexpired + this venue).
      const rc = await findValidRedeemCode(parsed.data.redeemCode, owned.venue.id);
      if (!rc) {
        return res.status(404).json({
          ok: false,
          error: 'invalid_redeem_code',
          message:
            'Code not valid (wrong, expired, or already used). Ask the customer to tap "Claim reward" again.',
        });
      }

      // 2. Safety re-check of the balance, then consume code + stamps.
      const progress = await getVenueProgress(rc.user_identity_id, owned.venue.id);
      if (progress.current < owned.venue.stamps_required) {
        return res.status(409).json({
          ok: false,
          error: 'not_enough_stamps',
          message: `Customer has ${progress.current}/${owned.venue.stamps_required} stamps.`,
        });
      }
      await markRedeemCodeUsed(rc.id);
      const rewardId = await redeemReward({
        identityId: rc.user_identity_id,
        venueId: owned.venue.id,
        stampsConsumed: owned.venue.stamps_required,
      });

      const after = await getVenueProgress(rc.user_identity_id, owned.venue.id);

      // 3. Mint the trophy — best-effort, never blocks the redemption.
      let trophy: { assetId: string; txSignature: string } | null = null;
      let trophySkipped: string | null = null;
      let bitsAwarded = 0;
      const customer = await getIdentityById(rc.user_identity_id);
      const wallet = customer?.solana_wallet ?? null;

      if (!wallet) {
        trophySkipped =
          'Customer wallet not linked yet — trophy will be mintable once they revisit their loyalty page.';
      } else {
        try {
          const edition = after.cardsCompleted;
          const minted = await mintCnftToWallet({
            recipient: wallet,
            name: `SV Trophy — ${owned.venue.name} #${edition}`.slice(0, 32),
            symbol: 'SVTROPHY',
            uri: trophyUri(),
          });
          trophy = { assetId: minted.assetId, txSignature: minted.signature };
          try {
            await setRewardTrophy(rewardId, minted.assetId, minted.signature);
          } catch (attachErr) {
            // eslint-disable-next-line no-console
            console.error('[loyalty.redeem] trophy attach failed:', attachErr);
          }
          // BITS reward for the completed card — same ledger the claim flow
          // uses, so it rolls up into the Profile balance and, later, into
          // Hall of Heroes via the identity link. Best-effort.
          try {
            const TROPHY_BITS = Number(process.env.TROPHY_BITS_REWARD ?? 1000);
            await creditBits(wallet, TROPHY_BITS, 'loyalty_trophy', {
              venue: owned.venue.slug,
              assetId: minted.assetId,
              edition,
            });
            bitsAwarded = TROPHY_BITS;
          } catch (bitsErr) {
            // eslint-disable-next-line no-console
            console.error('[loyalty.redeem] BITS credit failed:', bitsErr);
          }
        } catch (mintErr) {
          trophySkipped = 'Trophy mint failed — will be granted retroactively.';
          // eslint-disable-next-line no-console
          console.error('[loyalty.redeem] trophy mint failed:', (mintErr as Error).message);
        }
      }

      return res.status(200).json({
        ok: true,
        redeemed: true,
        stamps: after.current,
        required: owned.venue.stamps_required,
        cardsCompleted: after.cardsCompleted,
        trophy,
        trophySkipped,
        bitsAwarded,
      });
    } catch (err) {
      return serverError(res, 'redeem', err);
    }
  }
);
