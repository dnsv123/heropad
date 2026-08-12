import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import {
  requireAuth,
  getUserSolanaWallets,
  getPrivyUserContact,
  type AuthedRequest,
} from '../middleware/auth.js';
import { queryString } from '../lib/query.js';
import { claimAttemptLimiter } from '../middleware/claim-limit.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { getPartnerByIdentity } from '../lib/partners-db.js';
import {
  addStaff,
  claimStaffSeat,
  getSeatsForIdentity,
  getStaffActivity,
  countActiveStaff,
  getStaffSeat,
  listStaff,
  removeStaff,
  resetStaffToken,
  updateStaff,
} from '../lib/staff-db.js';
import { mintCnftToWallet } from '../lib/metaplex.js';
import { creditBits } from '../lib/supabase-admin.js';
import { claimVenueWithToken, claimVenueByCodeOnly } from './admin.js';
import {
  getVenueBySlug,
  getVenueById,
  ensureIdentity,
  findIdentityByCode,
  getIdentityById,
  getVenueProgress,
  countStampsToday,
  countTrophiesToday,
  countTrophiesTodayGlobal,
  reserveTrophyMint,
  grantStamps,
  revokeLatestStampToday,
  redeemReward,
  setRewardTrophy,
  createRedeemCode,
  findValidRedeemCode,
  markRedeemCodeUsed,
  getUserLoyaltyStats,
  getVenueAnalytics,
  getVenueToday,
  claimRequestId,
  getVenueHistory,
  updateVenueSettings,
  setMarketingConsent,
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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
})();

// Trophy mints per venue per rolling 24h. Sized well above what a real café
// produces (a customer completes a card every ~10 visits), so it only ever
// trips on farming — the cost of which lands on OUR admin wallet on mainnet.
// Hitting it never costs a customer their reward: the redemption completes and
// only the on-chain mint waits, so the ceiling can afford to be generous.
// Hoisted and guarded for the same reason as the caps below: `Number('1,000')`
// is NaN, and a NaN amount is serialised as null, rejected by the ledger, and
// swallowed — BITS would silently stop being credited with only a log line.
/** Seats included by the plan. Fails CLOSED — a bad value must not mean "no limit". */
function seatLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

const TROPHY_BITS_REWARD = (() => {
  const parsed = Number(process.env.TROPHY_BITS_REWARD);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : 1000;
})();

// The ceiling that bounds what the admin keypair can spend in a day across
// EVERY venue. A per-venue limit multiplies by the number of cafés, which is
// not a budget — it is a number that grows with success.
const MAX_TROPHIES_GLOBAL_DAY = (() => {
  const parsed = Number(process.env.TROPHY_GLOBAL_DAILY_CAP);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
})();

const MAX_TROPHIES_PER_VENUE_DAY = (() => {
  const parsed = Number(process.env.TROPHY_DAILY_CAP);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
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

/**
 * Loads the venue for COUNTER work and resolves who is acting.
 *
 * The owner and any active staff member both pass; the returned identity is
 * whoever actually pressed the button, which is what lands in
 * stamps.granted_by and therefore in the owner's transaction history. Reading
 * the venue's numbers is a different question and stays with loadOwnedVenue.
 */
async function loadCounterVenue(
  slug: string,
  privyId: string,
  res: Response
): Promise<{ venue: VenueRow; merchantIdentityId: string; isOwner: boolean } | null> {
  const venue = await loadActiveVenue(slug, res);
  if (!venue) return null;
  const identity = await ensureIdentity(privyId);

  if (venue.owner_identity_id && venue.owner_identity_id === identity.id) {
    return { venue, merchantIdentityId: identity.id, isOwner: true };
  }
  const seat = await getStaffSeat(venue.id, identity.id);
  if (seat) {
    return { venue, merchantIdentityId: identity.id, isOwner: false };
  }
  res.status(403).json({
    ok: false,
    error: 'not_merchant',
    message: 'Your account cannot serve this venue.',
  });
  return null;
}

function serverError(res: Response, scope: string, err: unknown): void {
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

const ConsentBody = z.object({
  consent: z.boolean(),
  email: z.string().trim().email().max(200).optional(),
  version: z.string().trim().max(40).default('2026-08-v1'),
});

// POST /api/loyalty/me/consent — marketing consent, opt-in only.
// Separate from using the service (contract basis) so the newsletter has its
// own, provable legal basis: we store WHEN and WHICH text was accepted.
loyaltyRouter.post('/me/consent', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const parsed = ConsentBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const identity = await ensureIdentity(privyId);

    // The address comes from the VERIFIED Privy account, never from the
    // request body. A body-supplied email lets a crafted call record a
    // consent that looks perfectly valid for someone else's address — which
    // inverts the entire point of storing consent as proof.
    const contact = await getPrivyUserContact(privyId);
    const email = contact.email ?? null;
    if (parsed.data.consent && !email) {
      return res.status(400).json({
        ok: false,
        error: 'no_email',
        message: 'Your account has no email address to send the newsletter to.',
      });
    }

    await setMarketingConsent(identity.id, parsed.data.consent, email, parsed.data.version);
    return res.status(200).json({ ok: true, consent: parsed.data.consent });
  } catch (err) {
    return serverError(res, 'consent', err);
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
  claimAttemptLimiter,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const venue = await loadActiveVenue(req.params.slug, res);
      if (!venue) return;

      const identity = await ensureIdentity(privyId);
      if (venue.owner_identity_id === identity.id) {
        return res.status(200).json({ ok: true, alreadyOwner: true });
      }

      // Becoming a merchant requires the one-time SETUP CODE generated by the
      // admin panel for this venue. Never "first logged-in user wins" — that
      // would let anyone take over a café and mint trophies at will.
      const token = queryString((req.body as { setupCode?: unknown })?.setupCode).trim();
      if (!/^[A-Z2-9]{8}$/i.test(token)) {
        return res.status(400).json({
          ok: false,
          error: 'setup_code_required',
          message: 'Enter the 8-character setup code you received from HeroPad.',
        });
      }
      const outcome = await claimVenueWithToken(venue.slug, token, privyId);
      if (outcome === 'ok') {
        return res.status(200).json({ ok: true, alreadyOwner: false, slug: venue.slug });
      }

      // The code may belong to a DIFFERENT venue (merchant opened /business
      // without ?venue=, or with the wrong one). Rather than failing, resolve
      // the venue from the code itself and link them to the right café.
      const byCode = await claimVenueByCodeOnly(token, privyId);
      if (byCode.ok) {
        return res.status(200).json({
          ok: true,
          alreadyOwner: false,
          slug: byCode.slug,
          name: byCode.name,
          redirected: true,
        });
      }
      return res.status(403).json({
        ok: false,
        error: 'bad_setup_code',
        message: 'That setup code is not valid (or was already used).',
      });
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

// GET /api/loyalty/me/roles - every hat this account wears.
//
// Someone can be a customer, a barista at one cafe, the owner of another, and
// a referral partner, all on one login. Without this the only way to discover
// you had been added to a team was to be told, and the only way to reach the
// right screen was to be sent a link.
loyaltyRouter.get('/me/roles', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const identity = await ensureIdentity(privyId);
    const supa = getSupabaseAdmin();

    const [seats, { data: owned, error: oErr }, partner] = await Promise.all([
      getSeatsForIdentity(identity.id),
      supa
        .from('venues')
        .select('slug, name')
        .eq('owner_identity_id', identity.id)
        .eq('active', true),
      getPartnerByIdentity(identity.id),
    ]);
    if (oErr) throw new Error(oErr.message);

    // Resolve the venues behind the seats in one query rather than per seat.
    let staffAt: Array<{ slug: string; name: string; displayName: string }> = [];
    if (seats.length > 0) {
      const { data: venues, error: vErr } = await supa
        .from('venues')
        .select('id, slug, name')
        .in('id', seats.map((x) => x.venueId));
      if (vErr) throw new Error(vErr.message);
      const byId = new Map(
        ((venues ?? []) as Array<{ id: string; slug: string; name: string }>).map((v) => [v.id, v])
      );
      staffAt = seats
        .map((seat) => {
          const v = byId.get(seat.venueId);
          return v ? { slug: v.slug, name: v.name, displayName: seat.displayName } : null;
        })
        .filter((x): x is { slug: string; name: string; displayName: string } => x !== null);
    }

    return res.status(200).json({
      ok: true,
      merchantOf: (owned ?? []) as Array<{ slug: string; name: string }>,
      staffAt,
      partner: partner
        ? { code: partner.code, displayName: partner.display_name, active: partner.active }
        : null,
    });
  } catch (err) {
    return serverError(res, 'me-roles', err);
  }
});

// GET /api/loyalty/merchant/:slug/me — what this account may do here.
//
// Replaces probing a customer-lookup endpoint and reading the error code to
// infer ownership: with staff seats that probe cannot tell an owner from a
// barista, and the UI would offer owner-only folders that then 403.
loyaltyRouter.get(
  '/merchant/:slug/me',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const venue = await loadActiveVenue(req.params.slug, res);
      if (!venue) return;
      const identity = await ensureIdentity(privyId);

      if (venue.owner_identity_id && venue.owner_identity_id === identity.id) {
        return res.status(200).json({ ok: true, role: 'owner', displayName: null });
      }
      const seat = await getStaffSeat(venue.id, identity.id);
      if (seat) {
        return res
          .status(200)
          .json({ ok: true, role: 'staff', displayName: seat.display_name });
      }
      // Deliberately does NOT say whether the venue is unclaimed. The public
      // endpoint withholds exactly that fact so nobody can enumerate which
      // cafés are takeable, and a free email signup must not buy the answer.
      return res.status(200).json({ ok: true, role: 'none' });
    } catch (err) {
      return serverError(res, 'merchant-me', err);
    }
  }
);

// GET /api/loyalty/merchant/:slug/today — the shift summary above the counter.
// Counter-level (owner OR staff): it is their shift too, and it is counts only.
loyaltyRouter.get(
  '/merchant/:slug/today',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadCounterVenue(req.params.slug, privyId, res);
      if (!owned) return;

      // The café's day, not UTC's: the client sends its own local midnight.
      const raw = queryString(req.query.since);
      const parsed = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : null;
      const now = Date.now();
      // Clamp to the last 48h so a crafted value cannot turn this into a
      // full-table scan dressed up as a shift summary.
      const since =
        parsed && now - parsed.getTime() < 48 * 3600_000 && parsed.getTime() <= now
          ? parsed
          : new Date(now - 24 * 3600_000);

      const today = await getVenueToday(owned.venue.id, since.toISOString());
      return res.status(200).json({ ok: true, ...today });
    } catch (err) {
      return serverError(res, 'merchant-today', err);
    }
  }
);

// --- Staff (venue team) ------------------------------------------------------
//
// Owner-only management, because the transaction history is partly a record of
// the staff and an employee cannot be the one deciding who has a seat.

// GET /api/loyalty/merchant/:slug/staff — the team + seats left on the plan.
loyaltyRouter.get(
  '/merchant/:slug/staff',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;
      const staff = await listStaff(owned.venue.id);
      const seats = seatLimit(owned.venue.staff_seats);
      const activity = await getStaffActivity(
        owned.venue.id,
        staff.map((x) => x.identity_id).filter((x): x is string => Boolean(x))
      );
      return res.status(200).json({
        ok: true,
        seats,
        used: staff.filter((s) => s.active).length,
        staff: staff.map((s) => ({
          id: s.id,
          displayName: s.display_name,
          role: s.role,
          active: s.active,
          linked: Boolean(s.identity_id),
          activationCode: s.claim_token,
          createdAt: s.created_at,
          activity: s.identity_id
            ? (activity.get(s.identity_id) ?? { granted30d: 0, revoked30d: 0, grantedToday: 0 })
            : null,
        })),
      });
    } catch (err) {
      return serverError(res, 'staff-list', err);
    }
  }
);

const AddStaffBody = z.object({
  displayName: z.string().trim().min(2).max(40),
  role: z.enum(['staff', 'manager']).default('staff'),
});

// POST /api/loyalty/merchant/:slug/staff — add a member + activation code.
loyaltyRouter.post(
  '/merchant/:slug/staff',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;

      const parsed = AddStaffBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_body',
          message: 'Give the team member a name (2-40 characters).',
        });
      }

      // Seat limit is the plan boundary. Refusing here rather than in the UI
      // means it holds however the request arrives.
      const seats = seatLimit(owned.venue.staff_seats);
      if ((await countActiveStaff(owned.venue.id)) >= seats) {
        return res.status(409).json({
          ok: false,
          error: 'no_seats',
          message: `Your plan includes ${seats} team accounts. Upgrade for more.`,
        });
      }

      const { staff, claimToken } = await addStaff(
        owned.venue.id,
        parsed.data.displayName,
        parsed.data.role
      );
      return res.status(201).json({
        ok: true,
        id: staff.id,
        displayName: staff.display_name,
        activationCode: claimToken,
      });
    } catch (err) {
      return serverError(res, 'staff-add', err);
    }
  }
);

const StaffPatchBody = z.object({
  action: z.enum(['deactivate', 'activate', 'remove', 'reset-code']),
});

// POST /api/loyalty/merchant/:slug/staff/:id — deactivate / remove / re-issue.
loyaltyRouter.post(
  '/merchant/:slug/staff/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;

      const parsed = StaffPatchBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ ok: false, error: 'invalid_body', message: 'Unknown action.' });
      }
      const id = req.params.id;

      if (parsed.data.action === 'remove') {
        // The stamps they granted keep pointing at their identity row, so
        // removing someone never rewrites history.
        const gone = await removeStaff(id, owned.venue.id);
        if (!gone) {
          return res
            .status(404)
            .json({ ok: false, error: 'unknown_staff', message: 'No such team member.' });
        }
        return res.status(200).json({ ok: true });
      }

      if (parsed.data.action === 'reset-code') {
        const token = await resetStaffToken(id, owned.venue.id);
        if (!token) {
          return res
            .status(404)
            .json({ ok: false, error: 'unknown_staff', message: 'No such team member.' });
        }
        return res.status(200).json({ ok: true, activationCode: token });
      }

      const active = parsed.data.action === 'activate';
      if (active) {
        const seats = seatLimit(owned.venue.staff_seats);
        if ((await countActiveStaff(owned.venue.id)) >= seats) {
          return res.status(409).json({
            ok: false,
            error: 'no_seats',
            message: `Your plan includes ${seats} team accounts.`,
          });
        }
      }
      const row = await updateStaff(id, owned.venue.id, { active });
      if (!row) {
        return res
          .status(404)
          .json({ ok: false, error: 'unknown_staff', message: 'No such team member.' });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      return serverError(res, 'staff-patch', err);
    }
  }
);

const StaffClaimBody = z.object({ code: z.string().trim().min(4).max(12) });

// POST /api/loyalty/staff/claim — a team member activates their seat.
loyaltyRouter.post(
  '/staff/claim',
  requireAuth,
  claimAttemptLimiter,
  async (req: Request, res: Response) => {
  try {
    const parsed = StaffClaimBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: 'Enter the code your manager gave you.',
      });
    }
    const privyId = (req as AuthedRequest).privyId as string;
    const identity = await ensureIdentity(privyId);
    const seat = await claimStaffSeat(parsed.data.code, identity.id);
    if (!seat) {
      return res.status(404).json({
        ok: false,
        error: 'bad_code',
        message: 'This code is not valid, or it has already been used.',
      });
    }
    const venue = await getVenueById(seat.venue_id);
    return res.status(200).json({
      ok: true,
      venueSlug: venue?.slug ?? null,
      venueName: venue?.name ?? null,
      displayName: seat.display_name,
    });
  } catch (err) {
      return serverError(res, 'staff-claim', err);
    }
  }
);

// GET /api/loyalty/merchant/:slug/history — the venue's own transaction log.
// Every stamp and reward IT handed out, newest first, with the anonymous
// customer code and who granted it. Query: ?from=&to=&code=&limit=
//
// Deliberately scoped to this venue: a merchant sees their own till, never a
// customer's activity elsewhere.
loyaltyRouter.get(
  '/merchant/:slug/history',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;

      const code = typeof req.query.code === 'string' ? req.query.code.trim().toUpperCase() : '';
      if (code && !CODE_RE.test(code)) {
        return res.status(400).json({
          ok: false,
          error: 'bad_code',
          message: 'Customer code must be 6 letters/digits.',
        });
      }

      // Bounded so a wide date range can never pull the whole table into memory.
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 200;

      const isDate = (v: unknown): v is string =>
        typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v));

      const by = queryString(req.query.by).trim();
      const events = await getVenueHistory(owned.venue.id, {
        by: by || undefined,
        from: isDate(req.query.from) ? req.query.from : undefined,
        // A plain YYYY-MM-DD 'to' should include that whole day, so push the
        // exclusive bound to the next midnight rather than dropping the day.
        to: isDate(req.query.to)
          ? /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
            ? new Date(Date.parse(`${req.query.to}T00:00:00Z`) + 86400000).toISOString()
            : req.query.to
          : undefined,
        code: code || undefined,
        limit,
        ownerIdentityId: owned.venue.owner_identity_id ?? null,
      });

      return res.status(200).json({ ok: true, events, limit, truncated: events.length >= limit });
    } catch (err) {
      return serverError(res, 'merchant-history', err);
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
      const owned = await loadCounterVenue(req.params.slug, privyId, res);
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
  /**
   * Generated once per tap by the client and reused on every retry, so a
   * grant whose response was lost to a dropped connection can be re-sent
   * without producing a second stamp.
   */
  requestId: z.string().trim().min(8).max(64).optional(),
});

// POST /api/loyalty/merchant/:slug/grant — the barista action. One request per
// purchase; count = number of coffees (1..5).
loyaltyRouter.post(
  '/merchant/:slug/grant',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadCounterVenue(req.params.slug, privyId, res);
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

      // A replayed tap: report the state as it stands rather than granting
      // again. Claimed before any write so a retry that races the original
      // still loses.
      if (parsed.data.requestId) {
        const fresh = await claimRequestId(
          `grant:${owned.venue.id}:${parsed.data.requestId}`,
          'grant'
        );
        if (!fresh) {
          const now = await getVenueProgress(customer.id, owned.venue.id);
          return res.status(200).json({
            ok: true,
            duplicate: true,
            granted: 0,
            happyHour: null,
            code: parsed.data.code,
            stamps: now.current,
            required: owned.venue.stamps_required,
            cardsCompleted: now.cardsCompleted,
            canRedeem: now.current >= owned.venue.stamps_required,
          });
        }
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
      const owned = await loadCounterVenue(req.params.slug, privyId, res);
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
      const removed = await revokeLatestStampToday(customer.id, owned.venue.id, owned.merchantIdentityId);
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
      const owned = await loadCounterVenue(req.params.slug, privyId, res);
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
          ? (owned.venue.branding.reward)
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
      } else if ((await countTrophiesTodayGlobal()) >= MAX_TROPHIES_GLOBAL_DAY) {
        // The platform-wide budget. Reaching it means something is wrong
        // somewhere, so it stops everywhere rather than per venue.
        trophySkipped =
          'Daily trophy budget reached — the reward stands and the trophy will be minted shortly.';
        console.error(
          `[loyalty.redeem] GLOBAL trophy budget hit (${MAX_TROPHIES_GLOBAL_DAY}/day) — investigate`
        );
      } else if ((await countTrophiesToday(owned.venue.id)) >= MAX_TROPHIES_PER_VENUE_DAY) {
        // Anti-Sybil ceiling. The reward is STILL handed over — only the
        // on-chain mint pauses, so a genuine (astonishing) day never costs a
        // customer their free coffee. Retroactive minting covers the gap.
        trophySkipped =
          'Daily trophy limit reached for this venue — the reward stands and the trophy will be minted shortly.';
        console.warn(
          `[loyalty.redeem] trophy cap hit for venue ${owned.venue.slug} — possible farming`
        );
      } else if (!(await reserveTrophyMint(rewardId))) {
        // Already reserved — a retry, or a concurrent request that got there
        // first. Never pay twice for the same reward.
        trophySkipped = 'Trophy already being minted for this reward.';
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
            console.error('[loyalty.redeem] trophy attach failed:', attachErr);
          }
          // BITS reward for the completed card — same ledger the claim flow
          // uses, so it rolls up into the Profile balance and, later, into
          // Hall of Heroes via the identity link. Best-effort.
          try {
            await creditBits(wallet, TROPHY_BITS_REWARD, 'loyalty_trophy', {
              venue: owned.venue.slug,
              assetId: minted.assetId,
              edition,
            });
            bitsAwarded = TROPHY_BITS_REWARD;
          } catch (bitsErr) {
            console.error('[loyalty.redeem] BITS credit failed:', bitsErr);
          }
        } catch (mintErr) {
          trophySkipped = 'Trophy mint failed — will be granted retroactively.';
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
