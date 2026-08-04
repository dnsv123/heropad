import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import {
  requireAuth,
  getUserSolanaWallets,
  type AuthedRequest,
} from '../middleware/auth.js';
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
  revokeLatestStampToday,
  redeemReward,
  setRewardTrophy,
  createRedeemCode,
  findValidRedeemCode,
  markRedeemCodeUsed,
  getUserLoyaltyStats,
  getVenueAnalytics,
  updateVenueSettings,
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
// Fails CLOSED: a malformed env value falls back to the safe default instead
// of turning into NaN, which would silently disable the cap entirely.
const MAX_STAMPS_PER_DAY = (() => {
  const parsed = Number(process.env.LOYALTY_DAILY_CAP);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
})();

// --- Happy Hour (Romania local time) -----------------------------------------

interface HappyHour {
  days: number[];
  start: string;
  end: string;
  mult: number;
}

function parseHappyHour(branding: Record<string, unknown> | null): HappyHour | null {
  const hh = branding?.happyHour as Partial<HappyHour> | undefined;
  if (
    !hh ||
    !Array.isArray(hh.days) ||
    hh.days.length === 0 ||
    typeof hh.start !== 'string' ||
    typeof hh.end !== 'string'
  ) {
    return null;
  }
  return {
    days: hh.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    start: hh.start,
    end: hh.end,
    mult: Number(hh.mult) >= 2 && Number(hh.mult) <= 3 ? Number(hh.mult) : 2,
  };
}

/** Hosts a "Leave us a Google review" link is allowed to point at. */
const GOOGLE_REVIEW_HOSTS = [
  'g.page',
  'goo.gl',
  'maps.app.goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
  'search.google.com',
  'business.google.com',
];

/** Multiplier if happy hour is active RIGHT NOW in Romania, else null. */
function happyHourMultNow(branding: Record<string, unknown> | null): number | null {
  const hh = parseHappyHour(branding);
  if (!hh) return null;
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', {
    timeZone: 'Europe/Bucharest',
    weekday: 'short',
  });
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayName);
  const time = now.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // "HH:MM" strings compare correctly lexicographically. Windows that cross
  // midnight (21:00–01:00) wrap, otherwise a bar-hours happy hour would save
  // successfully and then silently never fire.
  if (!hh.days.includes(day)) return null;
  const inWindow =
    hh.start <= hh.end
      ? hh.start <= time && time < hh.end
      : time >= hh.start || time < hh.end;
  return inWindow ? hh.mult : null;
}

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
    const hhMult = happyHourMultNow(venue.branding);
    return res.status(200).json({
      ok: true,
      venue: {
        slug: venue.slug,
        name: venue.name,
        stampsRequired: venue.stamps_required,
        branding: venue.branding,
        // `hasOwner` is intentionally NOT exposed publicly — it would tell an
        // attacker exactly which venues are claimable. /business discovers it
        // through the authenticated merchant probe instead.
        gpsLat: venue.gps_lat,
        gpsLng: venue.gps_lng,
        happyHour: hhMult ? { active: true, mult: hhMult } : null,
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

    // Wallet binding is one-time and VERIFIED: the client may hint which
    // address to link, but we only accept it after Privy confirms it belongs
    // to this account — otherwise trophies and BITS could be aimed at a
    // stranger's wallet. Already-bound identities skip the lookup entirely,
    // so the 4s progress polling costs nothing extra.
    const hinted =
      typeof req.query.wallet === 'string' &&
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(req.query.wallet)
        ? req.query.wallet
        : null;

    let identity = await ensureIdentity(privyId);
    if (hinted && !identity.solana_wallet) {
      try {
        const owned = await getUserSolanaWallets(privyId);
        if (owned.includes(hinted)) {
          identity = await ensureIdentity(privyId, hinted);
        }
      } catch (lookupErr) {
        // eslint-disable-next-line no-console
        console.warn('[loyalty.me] wallet verification skipped:', (lookupErr as Error).message);
      }
    }
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

      // Self-claim is a merchant-takeover primitive: whoever claims a venue can
      // grant stamps and mint trophies. It stays OFF unless explicitly enabled
      // for a supervised setup session (ALLOW_VENUE_SELF_CLAIM=true), and can
      // be narrowed to specific accounts via VENUE_CLAIM_ALLOWLIST (Privy DIDs).
      if (process.env.ALLOW_VENUE_SELF_CLAIM !== 'true') {
        return res.status(403).json({
          ok: false,
          error: 'claim_disabled',
          message: 'Venue setup is done by HeroPad. Please contact support.',
        });
      }
      const allowlist = (process.env.VENUE_CLAIM_ALLOWLIST ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowlist.length > 0 && !allowlist.includes(privyId)) {
        return res.status(403).json({
          ok: false,
          error: 'claim_disabled',
          message: 'This account is not allowed to claim venues.',
        });
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

const SettingsBody = z.object({
  stampsRequired: z.number().int().min(3).max(30).optional(),
  rewardLabel: z.string().trim().min(2).max(60).optional(),
  reviewUrl: z
    .union([
      z
        .string()
        .trim()
        .url()
        .max(300)
        // Rendered as an <a href> on the customer page — https only, so a
        // compromised merchant account can't inject javascript:/data: links.
        .refine((u) => u.startsWith('https://'), 'Must be an https:// link')
        // The button says "Leave us a Google review", so it must actually go
        // to Google. Without this, a merchant could point our trusted CTA at
        // a credential-harvesting page at the customer's happiest moment.
        .refine((u) => {
          try {
            return GOOGLE_REVIEW_HOSTS.includes(new URL(u).hostname.toLowerCase());
          } catch {
            return false;
          }
        }, 'Must be a Google review link (g.page, maps.app.goo.gl, google.com…)'),
      z.literal(''),
    ])
    .optional(),
  phone: z
    .union([z.string().trim().regex(/^[+0-9 ()\-.]{5,20}$/), z.literal('')])
    .optional(),
  happyHour: z
    .object({
      days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      mult: z.number().int().min(2).max(3),
    })
    .nullable()
    .optional(),
});

// POST /api/loyalty/merchant/:slug/settings — merchant self-service campaign
// settings: how many stamps a reward takes, and what the reward is. Applies
// instantly to the customer page (meter, levels, redeem threshold).
loyaltyRouter.post(
  '/merchant/:slug/settings',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;

      const parsed = SettingsBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_body',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      await updateVenueSettings(owned.venue.id, parsed.data);
      const fresh = await getVenueBySlug(owned.venue.slug);
      return res.status(200).json({
        ok: true,
        venue: {
          slug: fresh?.slug,
          name: fresh?.name,
          stampsRequired: fresh?.stamps_required,
          rewardLabel:
            typeof fresh?.branding?.reward === 'string' ? fresh.branding.reward : null,
        },
      });
    } catch (err) {
      return serverError(res, 'settings', err);
    }
  }
);

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
      // A merchant granting stamps to their own customer account is a free
      // trophy/BITS farm — block it on both grant and redeem.
      if (customer.id === owned.merchantIdentityId) {
        return res.status(403).json({
          ok: false,
          error: 'self_grant',
          message: 'You cannot grant stamps to your own account.',
        });
      }

      // Happy hour: purchases during the configured window earn multiplied
      // stamps. The multiplier is decided SERVER-side so it can't be spoofed.
      const hhMult = happyHourMultNow(owned.venue.branding);
      const effectiveCount = parsed.data.count * (hhMult ?? 1);

      // The cap bounds how many PURCHASES a day can be recorded, so it scales
      // with an active multiplier — otherwise a 3× happy hour would reject
      // every 4+ item purchase outright.
      const dailyCap = MAX_STAMPS_PER_DAY * (hhMult ?? 1);
      const today = await countStampsToday(customer.id, owned.venue.id);
      if (today + effectiveCount > dailyCap) {
        return res.status(429).json({
          ok: false,
          error: 'daily_cap',
          message: `Daily cap reached (${dailyCap} stamps/day per customer).`,
        });
      }

      await grantStamps({
        identityId: customer.id,
        venueId: owned.venue.id,
        count: effectiveCount,
        grantedBy: owned.merchantIdentityId,
        source: 'merchant',
      });

      const progress = await getVenueProgress(customer.id, owned.venue.id);
      return res.status(200).json({
        ok: true,
        granted: effectiveCount,
        happyHour: hhMult,
        stamps: progress.current,
        required: owned.venue.stamps_required,
        canRedeem: progress.current >= owned.venue.stamps_required,
      });
    } catch (err) {
      return serverError(res, 'grant', err);
    }
  }
);

const RevokeBody = z.object({
  code: z.string().regex(CODE_RE, 'Customer code must be 6 letters/digits'),
});

// POST /api/loyalty/merchant/:slug/revoke — barista correction: remove the
// customer's most recent stamp from today (mis-tapped +2 instead of +1).
loyaltyRouter.post(
  '/merchant/:slug/revoke',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;

      const parsed = RevokeBody.safeParse(req.body);
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
      const removed = await revokeLatestStampToday(customer.id, owned.venue.id);
      if (!removed) {
        return res.status(409).json({
          ok: false,
          error: 'nothing_to_revoke',
          message: 'No stamps from today to remove for this customer.',
        });
      }
      const progress = await getVenueProgress(customer.id, owned.venue.id);
      return res.status(200).json({
        ok: true,
        stamps: progress.current,
        required: owned.venue.stamps_required,
        canRedeem: progress.current >= owned.venue.stamps_required,
      });
    } catch (err) {
      return serverError(res, 'revoke', err);
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

      if (rc.user_identity_id === owned.merchantIdentityId) {
        return res.status(403).json({
          ok: false,
          error: 'self_redeem',
          message: 'You cannot redeem a reward for your own account.',
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
      // Consume the code FIRST — this is the atomic gate. If another request
      // beat us to it, stop here: no reward row, no trophy, no BITS.
      const consumed = await markRedeemCodeUsed(rc.id);
      if (!consumed) {
        return res.status(409).json({
          ok: false,
          error: 'code_already_used',
          message: 'This reward code was just used. Ask for a fresh one.',
        });
      }
      // Snapshot the CURRENT reward label into the row — if the venue later
      // changes its reward, history keeps showing what was actually given.
      const rewardLabel =
        typeof owned.venue.branding?.reward === 'string'
          ? (owned.venue.branding.reward as string)
          : undefined;
      const rewardId = await redeemReward({
        identityId: rc.user_identity_id,
        venueId: owned.venue.id,
        stampsConsumed: owned.venue.stamps_required,
        rewardType: rewardLabel,
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
