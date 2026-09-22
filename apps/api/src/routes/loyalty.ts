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
import { creditBits, countBitsEventsToday } from '../lib/supabase-admin.js';
import { claimVenueWithToken, claimVenueByCodeOnly } from './admin.js';
import { listPendingClaimsForCounter } from '../lib/rewards-db.js';
import {
  MAX_MILESTONES,
  claimMilestone,
  listVenueMilestones,
  milestoneStates,
  replaceVenueMilestones,
} from '../lib/milestones-db.js';
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
  getBirthday,
  setBirthday,
  setReferredBy,
  getReferralState,
  consumeReferralReward,
  countStampsTotal,
  type VenueRow,
  type IdentityRow,
} from '../lib/loyalty-db.js';
import {
  PASSPORT_TIERS,
  countStampsByVenue,
  getPassportAwards,
  reservePassportAward,
  reservePassportRetry,
  setPassportTrophy,
  listPassportVenues,
  type PassportTierKey,
} from '../lib/passport-db.js';

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

// A few BITS ride on every stamp — the purchase itself feeds the ecosystem,
// not just the milestones. Costs the café nothing (BITS are ours), stays
// proportionate to the big rewards (a full 10-stamp card earns ~20 BITS next
// to the 1000-BITS trophy). 0 disables it.
const STAMP_BITS_REWARD = (() => {
  const parsed = Number(process.env.STAMP_BITS_REWARD);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1000 ? parsed : 2;
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

// --- Passport (cross-venue) --------------------------------------------------
//
// Visit 3 / 5 / 8 DIFFERENT venues → bronze / silver / gold trophy + BITS.
// The trophy is deliberately NOT obtainable any other way: if collecting
// coffees at one café could earn it, nobody would ever enter a second one —
// the exclusivity of the threshold is the entire mechanism, and it is the
// pitch to café #10 ("my customers will reach you too").
//
// BITS, not stamps: a stamp would cost a café a free coffee for a visit made
// to a DIFFERENT venue, which would not be fair to anyone.

/** Fails closed like every other cap: a bad env value means the default. */
function passportBits(envKey: string, fallback: number): number {
  const parsed = Number(process.env[envKey]);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : fallback;
}

const PASSPORT_BITS: Record<PassportTierKey, number> = {
  bronze: passportBits('PASSPORT_BITS_BRONZE', 250),
  silver: passportBits('PASSPORT_BITS_SILVER', 500),
  gold: passportBits('PASSPORT_BITS_GOLD', 1000),
};

// --- Referral (Adu un prieten) ----------------------------------------------
//
// The friend's FIRST stamp — a real visit a barista validated — pays both
// sides. Registration alone pays nothing, so ghost accounts are worthless.

const REFERRAL_BITS_INVITER = (() => {
  const parsed = Number(process.env.REFERRAL_BITS_INVITER);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : 300;
})();

const REFERRAL_BITS_FRIEND = (() => {
  const parsed = Number(process.env.REFERRAL_BITS_FRIEND);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : 100;
})();

// How many friends one account can be PAID for per rolling 24h. Trophies have
// had a daily budget from the start; referral BITS had none, so a merchant
// with sock puppets could mint them without limit. A real person brings a
// friend or three a day, never twenty.
const REFERRAL_DAILY_CAP = (() => {
  const parsed = Number(process.env.REFERRAL_DAILY_CAP);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
})();

/**
 * Pays the referral bonus if this customer was invited and their first stamp
 * just landed. Safe to call on every grant: consumeReferralReward is a
 * conditional update that only ever wins once, and until the friend has a
 * wallet nothing is consumed, so the payout self-heals on a later visit.
 */
async function runReferralAward(customer: IdentityRow): Promise<void> {
  const state = await getReferralState(customer.id);
  if (!state.referredBy || state.rewardedAt) return;

  let friend = customer;
  if (!friend.solana_wallet) {
    try {
      const owned = await getUserSolanaWallets(friend.privy_id);
      if (owned.length > 0) friend = await ensureIdentity(friend.privy_id, owned[0]);
    } catch (walletErr) {
      console.warn('[loyalty.referral] wallet lookup skipped:', (walletErr as Error).message);
    }
  }
  if (!friend.solana_wallet) return;

  const inviter = await getIdentityById(state.referredBy);

  // The inviter's daily ceiling, checked BEFORE the one-shot gate is spent:
  // a capped-out inviter must not burn the friend's only chance at the bonus.
  if (inviter?.solana_wallet) {
    const paidToday = await countBitsEventsToday(inviter.solana_wallet, 'referral_inviter');
    if (paidToday >= REFERRAL_DAILY_CAP) {
      console.warn(
        `[loyalty.referral] inviter hit the daily cap (${REFERRAL_DAILY_CAP}) — deferring`
      );
      return;
    }
  }

  if (!(await consumeReferralReward(friend.id))) return; // someone else just paid it

  try {
    await creditBits(friend.solana_wallet, REFERRAL_BITS_FRIEND, 'referral_friend', {
      inviterCode: inviter?.loyalty_code ?? null,
    });
  } catch (bitsErr) {
    console.error('[loyalty.referral] friend credit failed:', (bitsErr as Error).message);
  }
  if (inviter?.solana_wallet) {
    try {
      // Deliberately NOT the friend's loyalty code: that code is what a
      // barista types to read someone's card, and the inviter would see it
      // forever in their own BITS history. A marker is all this row needs.
      await creditBits(inviter.solana_wallet, REFERRAL_BITS_INVITER, 'referral_inviter', {
        friend: 'linked',
      });
    } catch (bitsErr) {
      console.error('[loyalty.referral] inviter credit failed:', (bitsErr as Error).message);
    }
  } else {
    // Inviter erased their account or never linked a wallet — the friend's
    // half still stands; there is simply nobody left to pay the other half to.
    console.warn('[loyalty.referral] inviter wallet missing — inviter bonus skipped');
  }
}

const PASSPORT_LABEL: Record<PassportTierKey, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

function passportUri(tier: PassportTierKey): string {
  return (
    process.env[`PASSPORT_METADATA_URI_${tier.toUpperCase()}`] ??
    `https://heropad.supervictoruniverse.com/cnft/passport-${tier}.json`
  );
}

/**
 * Checks every tier this person has earned and mints what is still owed.
 * Safe to call from anywhere, any number of times: the UNIQUE (user, tier)
 * reservation in passport_awards makes each tier pay out exactly once, and a
 * reservation whose mint died is re-armed only after a cooldown.
 *
 * Runs after every grant (off the response path) and when the passport page
 * opens (so a customer whose wallet arrived late self-heals by looking).
 * Returns the identity, re-read if a wallet was bound along the way.
 */
async function runPassportAwards(identity: IdentityRow): Promise<IdentityRow> {
  let who = identity;

  // A customer who signed up before their embedded wallet finished
  // provisioning has earned tiers with nowhere to mint them. Privy is the
  // source of truth, so ask it — same self-heal the redeem flow relies on.
  if (!who.solana_wallet) {
    try {
      const owned = await getUserSolanaWallets(who.privy_id);
      if (owned.length > 0) who = await ensureIdentity(who.privy_id, owned[0]);
    } catch (walletErr) {
      console.warn('[loyalty.passport] wallet lookup skipped:', (walletErr as Error).message);
    }
  }
  if (!who.solana_wallet) return who; // earned tiers wait; nothing is reserved

  const visited = (await countStampsByVenue(who.id)).size;
  const awards = await getPassportAwards(who.id);
  const byTier = new Map(awards.map((a) => [a.tier, a]));

  for (const tier of PASSPORT_TIERS) {
    if (visited < tier.threshold) break; // thresholds are ascending

    const existing = byTier.get(tier.threshold);
    if (existing?.trophy_asset_id) continue; // paid in full

    // Same global budget as card trophies — one admin wallet, one ceiling.
    if ((await countTrophiesTodayGlobal()) >= MAX_TROPHIES_GLOBAL_DAY) {
      console.error(
        `[loyalty.passport] GLOBAL trophy budget hit (${MAX_TROPHIES_GLOBAL_DAY}/day) — tier ${tier.threshold} deferred`
      );
      break;
    }

    // Win the right to mint: a fresh insert for a new tier, a conditional
    // re-arm for one whose earlier mint produced nothing. Losing either race
    // means someone else is already paying — walk away.
    const awardId = existing
      ? (await reservePassportRetry(existing.id))
        ? existing.id
        : null
      : await reservePassportAward(who.id, tier.threshold, visited);
    if (!awardId) continue;

    try {
      const minted = await mintCnftToWallet({
        recipient: who.solana_wallet,
        name: `SV Passport — ${PASSPORT_LABEL[tier.key]}`,
        symbol: 'SVPASS',
        uri: passportUri(tier.key),
      });
      // BITS ride on the row: a retry that finds them already recorded must
      // not credit twice.
      const bits = existing?.bits_awarded ? 0 : PASSPORT_BITS[tier.key];
      await setPassportTrophy(
        awardId,
        minted.assetId,
        minted.signature,
        bits > 0 ? bits : (existing?.bits_awarded ?? 0)
      );
      if (bits > 0) {
        try {
          await creditBits(who.solana_wallet, bits, 'passport_trophy', {
            tier: tier.key,
            threshold: tier.threshold,
            assetId: minted.assetId,
          });
        } catch (bitsErr) {
          console.error('[loyalty.passport] BITS credit failed:', bitsErr);
        }
      }
    } catch (mintErr) {
      // The reservation stays; the cooldown re-arms it on a later visit.
      console.error(
        `[loyalty.passport] tier ${tier.threshold} mint failed:`,
        (mintErr as Error).message
      );
    }
  }
  return who;
}

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

/**
 * Seconds until this venue's Happy Hour starts, or until it ends if it is
 * running. Computed here rather than on the phone: the window belongs to the
 * venue's time zone, and doing that arithmetic in a browser somewhere else is
 * how the original bug happened.
 *
 * Returns null when no schedule exists or none is reachable within a week.
 */
function happyHourCountdown(
  branding: Record<string, unknown> | null,
  timeZone = 'Europe/Bucharest'
): { state: 'active' | 'upcoming'; seconds: number; mult: number } | null {
  const hh = parseHappyHour(branding);
  if (!hh || hh.days.length === 0) return null;

  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    zone = 'Europe/Bucharest';
  }

  const now = new Date();
  const active = happyHourMultNow(branding, zone);

  // Walk forward a minute at a time would be simple but wasteful; instead read
  // the venue's own wall clock and work in minutes-from-now.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const nowMin = Number(get('hour')) * 60 + Number(get('minute'));
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const startMin = toMin(hh.start);
  const endMin = toMin(hh.end);

  if (active) {
    // Minutes remaining until the end, wrapping past midnight if needed.
    const left = endMin > nowMin ? endMin - nowMin : 24 * 60 - nowMin + endMin;
    return { state: 'active', seconds: left * 60, mult: active };
  }

  // The next configured day whose start is still ahead of us.
  for (let ahead = 0; ahead <= 7; ahead++) {
    const d = (day + ahead) % 7;
    if (!hh.days.includes(d)) continue;
    const minutesAway = ahead * 24 * 60 + startMin - nowMin;
    if (minutesAway > 0) return { state: 'upcoming', seconds: minutesAway * 60, mult: hh.mult };
  }
  return null;
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
/**
 * Is this venue inside its Happy Hour right now?
 *
 * The zone used to be Europe/Bucharest, written into the code. A café in
 * Calgary set a window for 12:48 and watched it never fire, because 12:48 in
 * Bucharest is 03:48 where they stand. The setting saved, the panel showed it,
 * and it was wrong nine hours a day — a confident wrong answer, which is worse
 * than a missing feature. The zone belongs to the venue.
 */
function happyHourMultNow(
  branding: Record<string, unknown> | null,
  timeZone = 'Europe/Bucharest'
): number | null {
  const hh = parseHappyHour(branding);
  if (!hh) return null;
  const now = new Date();
  // An unknown zone would throw and take the whole grant down with it; a café
  // losing its happy hour is better than a café unable to serve.
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    zone = 'Europe/Bucharest';
  }
  const dayName = now.toLocaleDateString('en-US', {
    timeZone: zone,
    weekday: 'short',
  });
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayName);
  const time = now.toLocaleTimeString('en-GB', {
    timeZone: zone,
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

/**
 * Is today this person's birthday, on the venue's own clock? Evaluated
 * server-side so the counter only ever learns a boolean — the date itself
 * never leaves the profile. A Feb-29 birthday celebrates on Feb 28 in
 * non-leap years rather than silently never happening.
 */
function isBirthdayToday(day: number, month: number, timeZone = 'Europe/Bucharest'): boolean {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    zone = 'Europe/Bucharest';
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  const d = get('day');
  const m = get('month');
  if (m === month && d === day) return true;
  if (month === 2 && day === 29 && m === 2 && d === 28) {
    const y = get('year');
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return !leap;
  }
  return false;
}

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

// GET /api/loyalty/venues — every active venue: name, address, icon. Public
// on purpose: this is the printed-sticker information, and the Profile's
// "partner venues" list plus any future landing page read it. Nothing here
// says whether a venue is claimed or what it earns.
loyaltyRouter.get('/venues', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('venues')
      .select('slug, name, address, branding')
      .eq('active', true)
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return res.status(200).json({
      ok: true,
      venues: ((data ?? []) as Array<{
        slug: string;
        name: string;
        address: string | null;
        branding: Record<string, unknown> | null;
      }>).map((v) => ({
        slug: v.slug,
        name: v.name,
        address: v.address,
        icon: typeof v.branding?.icon === 'string' ? v.branding.icon : null,
      })),
    });
  } catch (err) {
    return serverError(res, 'venues', err);
  }
});

// GET /api/loyalty/venue/:slug — public venue card (no auth, no PII).
loyaltyRouter.get('/venue/:slug', async (req: Request, res: Response) => {
  try {
    const venue = await loadActiveVenue(req.params.slug, res);
    if (!venue) return;
    const hhMult = happyHourMultNow(venue.branding, venue.timezone ?? undefined);
    // Allowlist, not passthrough: `branding` is a jsonb bag that seeds and
    // manual Supabase edits also write to. Sending it whole means any key
    // anyone ever adds becomes public with nobody reviewing the decision.
    const b = venue.branding ?? {};
    const publicBranding: Record<string, unknown> = {};
    for (const key of [
      'reward',
      'icon',
      'accent',
      'logo',
      'tagline',
      'reviewUrl',
      'phone',
      'email',
      'instagram',
      'facebook',
      'website',
      'happyHour',
      // "What's on this week" + when it was written. Both go out: the customer
      // page hides a notice older than two weeks, and the merchant's own
      // settings form needs to show the current text even once it has gone
      // stale — otherwise editing it looks like it was silently deleted.
      'announcement',
      'announcementAt',
      'announcementKind',
      'orderUrl',
    ] as const) {
      if (b[key] !== undefined) publicBranding[key] = b[key];
    }
    // The milestones are the venue's public promise, pictures included; the
    // customer's own progress against them comes from /me/:slug.
    const milestones = (await listVenueMilestones(venue.id)).map((m) => ({
      at: m.at,
      label: m.label,
      image: m.image,
    }));
    return res.status(200).json({
      ok: true,
      venue: {
        slug: venue.slug,
        name: venue.name,
        stampsRequired: venue.stamps_required,
        branding: publicBranding,
        milestones,
        // `hasOwner` is intentionally NOT exposed publicly — it would tell an
        // attacker exactly which venues are claimable. /business discovers it
        // through the authenticated merchant probe instead.
        gpsLat: venue.gps_lat,
        gpsLng: venue.gps_lng,
        happyHour: hhMult ? { active: true, mult: hhMult } : null,
        // The schedule is a promotion: knowing when it runs is the point.
        happyHourNext: happyHourCountdown(venue.branding, venue.timezone ?? undefined),
        timezone: venue.timezone ?? 'Europe/Bucharest',
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

// GET /api/loyalty/me/passport — the cross-venue passport page: visited count,
// tier progress, the full venue album, and any trophies owed get minted on the
// spot. Literal route — MUST stay above /me/:slug.
loyaltyRouter.get('/me/passport', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    let identity = await ensureIdentity(privyId);

    // Opening the passport claims anything already earned — the mint happens
    // right here so the trophy is on the page the customer is looking at.
    // Best-effort: a mint-infrastructure hiccup must never blank the page.
    try {
      identity = await runPassportAwards(identity);
    } catch (awardErr) {
      console.error('[loyalty.passport] award pass failed:', (awardErr as Error).message);
    }

    const stampsByVenue = await countStampsByVenue(identity.id);
    const visited = stampsByVenue.size;
    const [awards, venues] = await Promise.all([
      getPassportAwards(identity.id),
      listPassportVenues([...stampsByVenue.keys()]),
    ]);
    const byTier = new Map(awards.map((a) => [a.tier, a]));

    return res.status(200).json({
      ok: true,
      visited,
      walletLinked: Boolean(identity.solana_wallet),
      tiers: PASSPORT_TIERS.map((t) => {
        const award = byTier.get(t.threshold);
        return {
          threshold: t.threshold,
          key: t.key,
          earned: visited >= t.threshold,
          // Earned but not yet on-chain: wallet missing, budget hit, or a
          // mint mid-retry. The page says "on its way" instead of showing
          // a hole where a trophy should be.
          minted: Boolean(award?.trophy_asset_id),
          assetId: award?.trophy_asset_id ?? null,
          mintTx: award?.mint_tx ?? null,
          bits: award?.bits_awarded ?? 0,
          awardedAt: award?.created_at ?? null,
        };
      }),
      venues: venues.map((v) => ({
        slug: v.slug,
        name: v.name,
        address: v.address,
        icon: typeof v.branding?.icon === 'string' ? v.branding.icon : null,
        stamps: stampsByVenue.get(v.id) ?? 0,
        visited: stampsByVenue.has(v.id),
      })),
    });
  } catch (err) {
    return serverError(res, 'passport', err);
  }
});

// Day+month only — the year is age, and age is data we have no use for.
// Upper bound per month so "31 February" cannot be stored; 29 Feb is allowed.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const BirthdayBody = z
  .union([
    z.object({
      day: z.number().int().min(1).max(31),
      month: z.number().int().min(1).max(12),
    }),
    z.object({ clear: z.literal(true) }),
  ])
  .refine(
    (b) => 'clear' in b || b.day <= DAYS_IN_MONTH[b.month - 1],
    'That day does not exist in that month.'
  );

// GET /api/loyalty/me/code — the personal loyalty code, for the Profile card
// that keeps it always at hand. Literal route — MUST stay above /me/:slug.
loyaltyRouter.get('/me/code', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const identity = await ensureIdentity(privyId);
    return res.status(200).json({ ok: true, code: identity.loyalty_code });
  } catch (err) {
    return serverError(res, 'me-code', err);
  }
});

// GET /api/loyalty/me/birthday — what the profile currently holds.
// Literal route — MUST stay above /me/:slug.
loyaltyRouter.get('/me/birthday', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const identity = await ensureIdentity(privyId);
    const birthday = await getBirthday(identity.id);
    return res.status(200).json({ ok: true, ...birthday });
  } catch (err) {
    return serverError(res, 'birthday-get', err);
  }
});

// POST /api/loyalty/me/birthday — set or clear. Voluntary by design: the field
// sits in the customer's own profile with the explanation next to it, and
// clearing it deletes the data. The counter never sees the date — only the
// computed "today is their day" flag on the customer lookup.
loyaltyRouter.post('/me/birthday', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const parsed = BirthdayBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const identity = await ensureIdentity(privyId);
    if ('clear' in parsed.data) {
      await setBirthday(identity.id, null, null);
      return res.status(200).json({ ok: true, day: null, month: null });
    }
    await setBirthday(identity.id, parsed.data.day, parsed.data.month);
    return res.status(200).json({ ok: true, day: parsed.data.day, month: parsed.data.month });
  } catch (err) {
    return serverError(res, 'birthday-set', err);
  }
});

const ReferralBody = z.object({
  code: z.string().regex(CODE_RE, 'Invite code must be 6 letters/digits'),
});

// POST /api/loyalty/me/referral — the friend followed an invite link
// (?ref=CODE) and just logged in. Links the invitation ONLY while the account
// is brand-new (zero stamps) and unlinked; first link wins, self is refused.
// Deliberately never says WHY it did not link — the response would otherwise
// be an oracle for probing which codes exist. Literal route — above /me/:slug.
loyaltyRouter.post('/me/referral', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const parsed = ReferralBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const identity = await ensureIdentity(privyId);

    if ((await countStampsTotal(identity.id)) > 0) {
      return res.status(200).json({ ok: true, linked: false });
    }
    const inviter = await findIdentityByCode(parsed.data.code);
    if (inviter && inviter.id !== identity.id) {
      await setReferredBy(identity.id, inviter.id);
    }
    // The SAME answer whatever happened. Reporting `linked` told the caller
    // whether a code exists, which turned this into an enumeration oracle for
    // the very codes baristas use to look people up. The client does not need
    // the answer — it clears its pending code either way.
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, 'referral', err);
  }
});

// NOTE: every literal /me/... route MUST be registered above /me/:slug.
// Express matches in order, so a later /me/roles is captured by the slug
// route and answered as "no such venue" - which is exactly how this one
// silently returned nothing the first time.
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
    const milestones = (
      await milestoneStates(identity.id, venue.id, progress.current, progress.cardsCompleted)
    ).map(({ at, label, claimed, claimable }) => ({ at, label, claimed, claimable }));

    return res.status(200).json({
      ok: true,
      code: identity.loyalty_code,
      venue: { slug: venue.slug, name: venue.name },
      stamps: progress.current,
      required: venue.stamps_required,
      totalStamps: progress.totalStamps,
      cardsCompleted: progress.cardsCompleted,
      canRedeem: progress.current >= venue.stamps_required,
      milestones,
      // A milestone is waiting at the counter: the reward-code button shows
      // for it exactly as it does for a full card.
      milestoneClaimable: milestones.some((m) => m.claimable),
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

// --- NFC check-in (Faza 2a) --------------------------------------------------
//
// The figurine's tap URL carries ?tap=1. After the customer's phone opens
// their card, it announces them here — and the counter screen shows their
// code without anyone typing it. The barista still grants every stamp, so a
// spoofed check-in buys an attacker nothing but a code on a screen; that is
// why this phase needs no chip cryptography. In-memory on purpose: a
// check-in is 3 minutes of ephemeral state, not a record.

interface CounterCheckin {
  identityId: string;
  code: string;
  at: number;
}

const CHECKIN_TTL_MS = 3 * 60 * 1000;
const CHECKIN_MAX_PER_VENUE = 15;
const checkinsByVenue = new Map<string, CounterCheckin[]>();

function liveCheckins(venueId: string): CounterCheckin[] {
  const now = Date.now();
  const list = (checkinsByVenue.get(venueId) ?? []).filter(
    (c) => now - c.at < CHECKIN_TTL_MS
  );
  checkinsByVenue.set(venueId, list);
  return list;
}

/** Served customers leave the queue the moment their stamp lands. */
function clearCheckin(venueId: string, identityId: string): void {
  checkinsByVenue.set(
    venueId,
    liveCheckins(venueId).filter((c) => c.identityId !== identityId)
  );
}

// POST /api/loyalty/me/:slug/checkin — "I just tapped the figurine".
loyaltyRouter.post(
  '/me/:slug/checkin',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const venue = await loadActiveVenue(req.params.slug, res);
      if (!venue) return;
      const identity = await ensureIdentity(privyId);
      if (!identity.loyalty_code) return res.status(200).json({ ok: true });

      const list = liveCheckins(venue.id);
      const mine = list.find((c) => c.identityId === identity.id);
      // Re-taps refresh rather than duplicate, and a 30s floor keeps a
      // nervous tapper from hammering the store.
      if (mine && Date.now() - mine.at < 30_000) {
        return res.status(200).json({ ok: true });
      }
      const rest = list.filter((c) => c.identityId !== identity.id);
      rest.push({ identityId: identity.id, code: identity.loyalty_code, at: Date.now() });
      checkinsByVenue.set(venue.id, rest.slice(-CHECKIN_MAX_PER_VENUE));
      return res.status(200).json({ ok: true });
    } catch (err) {
      return serverError(res, 'checkin', err);
    }
  }
);

// GET /api/loyalty/merchant/:slug/checkins — the live counter queue.
loyaltyRouter.get(
  '/merchant/:slug/checkins',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadCounterVenue(req.params.slug, privyId, res);
      if (!owned) return;
      const now = Date.now();
      return res.status(200).json({
        ok: true,
        checkins: liveCheckins(owned.venue.id)
          .slice()
          .reverse()
          .map((c) => ({ code: c.code, secondsAgo: Math.round((now - c.at) / 1000) })),
      });
    } catch (err) {
      return serverError(res, 'checkins', err);
    }
  }
);

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
        // Not a full card — but a milestone on the way may be waiting.
        const states = await milestoneStates(
          identity.id,
          venue.id,
          progress.current,
          progress.cardsCompleted
        );
        if (!states.some((m) => m.claimable)) {
          return res.status(409).json({
            ok: false,
            error: 'not_enough_stamps',
            message: `You have ${progress.current}/${venue.stamps_required} stamps.`,
          });
        }
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
    // Length and characters, not a national format: a partner venue may be
    // anywhere, and "+1 403 923 8127" is as valid as an 07xx number.
    .union([z.string().trim().regex(/^[+0-9 ()\-.]{5,25}$/), z.literal('')])
    .optional(),
  email: z.union([z.string().trim().email().max(120), z.literal('')]).optional(),
  instagram: z.union([z.string().trim().max(120), z.literal('')]).optional(),
  facebook: z.union([z.string().trim().max(200), z.literal('')]).optional(),
  website: z
    .union([
      z
        .string()
        .trim()
        .max(200)
        .refine((u) => {
          try {
            return ['http:', 'https:'].includes(new URL(u).protocol);
          } catch {
            return false;
          }
        }, 'Must be a http(s) address'),
      z.literal(''),
    ])
    .optional(),
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone')
    .optional(),
  // One short line, not a newsfeed: the cap keeps it readable on a phone and
  // keeps the venue writing "Live music Thursday 20:00" instead of an essay.
  announcement: z.union([z.string().trim().max(160), z.literal('')]).optional(),
  // What kind of line it is: shapes the chip on the card (gold for an
  // offer, cyan for an event, plain for news). One selector, no new field
  // for the owner to fill in.
  announcementKind: z.enum(['news', 'offer', 'event']).optional(),
  // "Order ahead" — a link to whatever ordering system the venue already
  // uses (their site, Glovo, a form). We open a door; we do not build the
  // kitchen. https only: it is rendered as a button on the customer's card.
  orderUrl: z
    .union([
      z
        .string()
        .trim()
        .url()
        .max(300)
        .refine((u) => u.startsWith('https://'), 'Must be an https:// link'),
      z.literal(''),
    ])
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
      // The counter learns a boolean, never the date: enough for the barista
      // to say "la mulți ani" and offer something nice, and nothing more.
      const birthday = await getBirthday(customer.id);
      const birthdayToday =
        birthday.day !== null &&
        birthday.month !== null &&
        isBirthdayToday(birthday.day, birthday.month, owned.venue.timezone ?? undefined);
      // Rewards this customer claimed with BITS and can pick up HERE — the
      // barista gets a button per item instead of a code to type.
      const rewards = await listPendingClaimsForCounter(customer.id, owned.venue.id);
      const milestones = (
        await milestoneStates(customer.id, owned.venue.id, progress.current, progress.cardsCompleted)
      ).map(({ at, label, claimed, claimable }) => ({ at, label, claimed, claimable }));
      return res.status(200).json({
        ok: true,
        code: customer.loyalty_code,
        stamps: progress.current,
        required: owned.venue.stamps_required,
        cardsCompleted: progress.cardsCompleted,
        canRedeem: progress.current >= owned.venue.stamps_required,
        birthdayToday,
        rewards,
        milestones,
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
      const hhMult = happyHourMultNow(owned.venue.branding, owned.venue.timezone ?? undefined);
      const effectiveCount = parsed.data.count * (hhMult ?? 1);

      // The cap bounds how many PURCHASES a day can be recorded, so it scales
      // with an active multiplier — otherwise a 3× happy hour would reject
      // every 4+ item purchase outright.
      const dailyCap = MAX_STAMPS_PER_DAY * (hhMult ?? 1);
      const today = await countStampsToday(customer.id, owned.venue.id, owned.venue.timezone ?? undefined);
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

      // The first stamp at a NEW venue may cross a passport threshold
      // (3/5/8 distinct venues). Runs off the response path — the barista's
      // confirmation must never wait on a Solana mint.
      void runPassportAwards(customer).catch((passErr) => {
        console.error('[loyalty.grant] passport check failed:', (passErr as Error).message);
      });
      // An invited friend's first stamp pays the referral bonus. Same rule:
      // off the response path, pays exactly once.
      void runReferralAward(customer).catch((refErr) => {
        console.error('[loyalty.grant] referral check failed:', (refErr as Error).message);
      });
      // The stamp IS the service — their figurine check-in has done its job.
      clearCheckin(owned.venue.id, customer.id);
      // Per-stamp BITS, best-effort and off the response path. No wallet yet →
      // silently skipped (unlike trophies these are pocket change, not worth a
      // retro-mint pipeline). A later revoke does not claw them back — the
      // amounts are too small to justify negative ledger entries.
      if (STAMP_BITS_REWARD > 0 && customer.solana_wallet) {
        void creditBits(
          customer.solana_wallet,
          effectiveCount * STAMP_BITS_REWARD,
          'stamp',
          { venue: owned.venue.slug, count: effectiveCount }
        ).catch((bitsErr) => {
          console.error('[loyalty.grant] stamp BITS failed:', bitsErr);
        });
      }

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
  /** Corrections come in the same sizes as grants, so the pad reads evenly. */
  count: z.number().int().min(1).max(2).default(1),
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
      // Loop rather than a bulk delete: each call takes the newest live stamp
      // under a conditional update, so two baristas correcting at once can
      // never remove the same one twice.
      let removedCount = 0;
      for (let i = 0; i < parsed.data.count; i++) {
        const ok = await revokeLatestStampToday(customer.id, owned.venue.id, owned.merchantIdentityId, owned.venue.timezone ?? undefined);
        if (!ok) break;
        removedCount += 1;
      }
      const removed = removedCount > 0;
      if (!removed) {
        return res.status(409).json({
          ok: false,
          error: 'nothing_to_revoke',
          message: 'No stamps from today to remove for this customer.',
        });
      }
      // Take the stamp BITS back with the stamp. Leaving them was a deliberate
      // "too small to bother" call — and it was wrong: countStampsToday only
      // counts LIVE stamps, so a grant→revoke loop reset the daily cap while
      // every grant paid out again. The clawback closes the loop: the pair is
      // now worth exactly zero, whatever the loop count.
      if (STAMP_BITS_REWARD > 0 && customer.solana_wallet) {
        void creditBits(
          customer.solana_wallet,
          -removedCount * STAMP_BITS_REWARD,
          'stamp_revoked',
          { venue: owned.venue.slug, count: removedCount }
        ).catch((bitsErr) => {
          console.error('[loyalty.revoke] BITS clawback failed:', (bitsErr as Error).message);
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
  /** Set when the barista hands over a milestone instead of the full card. */
  milestoneAt: z.number().int().min(1).max(29).optional(),
});

// POST /api/loyalty/merchant/:slug/redeem-options — what a reward code can be
// used for, WITHOUT consuming it: the full card, one or more milestones, or
// nothing yet. The counter asks this first when a venue has milestones, so
// the barista chooses what to hand over instead of the code deciding.
loyaltyRouter.post(
  '/merchant/:slug/redeem-options',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadCounterVenue(req.params.slug, privyId, res);
      if (!owned) return;
      const parsed = RedeemBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: 'invalid_body', message: 'Reward code must be 6 letters/digits' });
      }
      const rc = await findValidRedeemCode(parsed.data.redeemCode, owned.venue.id);
      if (!rc) {
        return res.status(404).json({
          ok: false,
          error: 'invalid_redeem_code',
          message:
            'Code not valid (wrong, expired, or already used). Ask the customer to tap "Claim reward" again.',
        });
      }
      const progress = await getVenueProgress(rc.user_identity_id, owned.venue.id);
      const states = await milestoneStates(
        rc.user_identity_id,
        owned.venue.id,
        progress.current,
        progress.cardsCompleted
      );
      const rewardLabel =
        typeof owned.venue.branding?.reward === 'string' ? owned.venue.branding.reward : null;
      return res.status(200).json({
        ok: true,
        stamps: progress.current,
        required: owned.venue.stamps_required,
        full: progress.current >= owned.venue.stamps_required,
        rewardLabel,
        milestones: states.map(({ at, label, claimed, claimable }) => ({ at, label, claimed, claimable })),
      });
    } catch (err) {
      return serverError(res, 'redeem-options', err);
    }
  }
);

const MilestonesBody = z.object({
  milestones: z
    .array(
      z.object({
        at: z.number().int().min(1).max(29),
        label: z.string().trim().min(2).max(40),
        // A small photo the owner picked, resized in the browser to ≤256 px
        // WebP. ~60 KB of base64 is generous for that; it is also the cap
        // that keeps the public venue payload light.
        image: z
          .string()
          .regex(/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/)
          .max(80_000)
          .nullable()
          .optional(),
      })
    )
    .max(MAX_MILESTONES),
});

// GET /api/loyalty/merchant/:slug/milestones — the owner's current list.
loyaltyRouter.get(
  '/merchant/:slug/milestones',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;
      const milestones = (await listVenueMilestones(owned.venue.id)).map((m) => ({
        at: m.at,
        label: m.label,
        image: m.image,
      }));
      return res.status(200).json({ ok: true, milestones, stampsRequired: owned.venue.stamps_required });
    } catch (err) {
      return serverError(res, 'milestones', err);
    }
  }
);

// PUT /api/loyalty/merchant/:slug/milestones — replace the list. Every
// threshold must sit strictly below the full card and be distinct.
loyaltyRouter.put(
  '/merchant/:slug/milestones',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const privyId = (req as AuthedRequest).privyId as string;
      const owned = await loadOwnedVenue(req.params.slug, privyId, res);
      if (!owned) return;
      const parsed = MilestonesBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_body',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      const items = parsed.data.milestones;
      const ats = items.map((m) => m.at);
      if (new Set(ats).size !== ats.length) {
        return res.status(400).json({ ok: false, error: 'duplicate_at', message: 'Two milestones at the same number of stamps.' });
      }
      if (ats.some((at) => at >= owned.venue.stamps_required)) {
        return res.status(400).json({
          ok: false,
          error: 'at_too_high',
          message: `A milestone must come before the full card (${owned.venue.stamps_required} stamps).`,
        });
      }
      const saved = await replaceVenueMilestones(
        owned.venue.id,
        items.map((m) => ({ at: m.at, label: m.label, image: m.image ?? null }))
      );
      return res.status(200).json({
        ok: true,
        milestones: saved.map((m) => ({ at: m.at, label: m.label, image: m.image })),
      });
    } catch (err) {
      return serverError(res, 'milestones-save', err);
    }
  }
);

/**
 * Trophy metadata for the collectible cNFT minted at redemption. Off-chain
 * JSON is a static file served by the web app; the on-chain name carries the
 * venue + edition so each trophy is individually identifiable.
 */
function trophyUri(): string {
  return (
    process.env.TROPHY_METADATA_URI ?? 'https://heropad.supervictoruniverse.com/cnft/trophy.json'
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

      // A milestone hand-over: the code is spent, the milestone is recorded,
      // the card keeps every stamp. No trophy, no BITS — those belong to the
      // full card. The claim row is the gate (unique per card), so the code
      // is consumed only after the claim succeeded.
      if (parsed.data.milestoneAt !== undefined) {
        const at = parsed.data.milestoneAt;
        const def = (await listVenueMilestones(owned.venue.id)).find((m) => m.at === at);
        if (!def) {
          return res.status(404).json({ ok: false, error: 'unknown_milestone', message: 'This venue has no such milestone.' });
        }
        if (progress.current < at) {
          return res.status(409).json({
            ok: false,
            error: 'not_enough_stamps',
            message: `Customer has ${progress.current}/${at} stamps for this milestone.`,
          });
        }
        const claimed = await claimMilestone({
          identityId: rc.user_identity_id,
          venueId: owned.venue.id,
          at,
          label: def.label,
          cardCycle: progress.cardsCompleted,
          validatedBy: owned.merchantIdentityId,
        });
        if (!claimed) {
          return res.status(409).json({
            ok: false,
            error: 'milestone_already_claimed',
            message: 'This milestone was already handed over on the current card.',
          });
        }
        await markRedeemCodeUsed(rc.id);
        return res.status(200).json({
          ok: true,
          redeemed: true,
          milestone: { at, label: def.label },
          stamps: progress.current,
          required: owned.venue.stamps_required,
          cardsCompleted: progress.cardsCompleted,
          trophy: null,
          trophySkipped: null,
          bitsAwarded: 0,
        });
      }

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
