import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import {
  getVenueBySlug,
  claimVenueOwnership,
  ensureIdentity,
  findIdentityByCode,
  getVenueProgress,
  countStampsToday,
  grantStamps,
  redeemReward,
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

const MAX_STAMPS_PER_DAY = 10;

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
  code: z.string().regex(CODE_RE, 'Customer code must be 6 letters/digits'),
});

// POST /api/loyalty/merchant/:slug/redeem — barista consumes a full card and
// hands over the reward. Extra stamps beyond `required` carry to the next card.
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

      const customer = await findIdentityByCode(parsed.data.code);
      if (!customer) {
        return res.status(404).json({
          ok: false,
          error: 'unknown_code',
          message: 'No customer with this code.',
        });
      }

      const progress = await getVenueProgress(customer.id, owned.venue.id);
      if (progress.current < owned.venue.stamps_required) {
        return res.status(409).json({
          ok: false,
          error: 'not_enough_stamps',
          message: `Customer has ${progress.current}/${owned.venue.stamps_required} stamps.`,
        });
      }

      await redeemReward({
        identityId: customer.id,
        venueId: owned.venue.id,
        stampsConsumed: owned.venue.stamps_required,
      });

      const after = await getVenueProgress(customer.id, owned.venue.id);
      return res.status(200).json({
        ok: true,
        redeemed: true,
        stamps: after.current,
        required: owned.venue.stamps_required,
        cardsCompleted: after.cardsCompleted,
      });
    } catch (err) {
      return serverError(res, 'redeem', err);
    }
  }
);
