import { randomInt } from 'node:crypto';

import { getSupabaseAdmin } from './supabase-admin.js';

// Loyalty data layer (schema 003 + 004).
// ---------------------------------------------------------------------------
// Same philosophy as supabase-admin.ts: typed helpers only, service-role
// client, all SQL-ish logic in one auditable file. Stamps are OFF-CHAIN rows;
// no chain is touched anywhere in this module.

// --- Types -------------------------------------------------------------------

export interface VenueRow {
  id: string;
  slug: string;
  name: string;
  stamps_required: number;
  branding: Record<string, unknown>;
  active: boolean;
  owner_identity_id: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  /** Billing + referral attribution (migration 008). */
  monthly_fee?: number | null;
  billing_status?: string | null;
  paid_since?: string | null;
  referred_by?: string | null;
  /** Staff seats included by the plan (migration 009). */
  staff_seats?: number | null;
  /** IANA zone the venue's own clock runs on (migration 015). */
  timezone?: string | null;
}

/** Happy-hour config stored in venues.branding.happyHour. */
export interface HappyHourConfig {
  /** Weekdays 0 (Sun) – 6 (Sat). */
  days: number[];
  /** "HH:MM" in 24h clock, read in the venue's own time zone. */
  start: string;
  end: string;
  /** Stamp multiplier while active (2 or 3). */
  mult: number;
}

export interface IdentityRow {
  id: string;
  privy_id: string;
  loyalty_code: string | null;
  solana_wallet: string | null;
}

export interface VenueProgress {
  /** Stamps earned and not yet consumed by a redeemed reward. */
  current: number;
  /** Lifetime stamps at this venue. */
  totalStamps: number;
  /** Rewards redeemed at this venue. */
  cardsCompleted: number;
}

// --- Venues ------------------------------------------------------------------

const VENUE_SELECT =
  'id, slug, name, stamps_required, branding, active, owner_identity_id, gps_lat, gps_lng, monthly_fee, billing_status, paid_since, referred_by, staff_seats, timezone';

export async function getVenueBySlug(slug: string): Promise<VenueRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('venues')
    .select(
      VENUE_SELECT
    )
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getVenueBySlug: ${error.message}`);
  return (data) ?? null;
}

/** Same row, by id — used when a code resolves to a venue rather than a slug. */
export async function getVenueById(id: string): Promise<VenueRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('venues')
    .select(VENUE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getVenueById: ${error.message}`);
  return data ?? null;
}

/**
 * First authenticated user to claim an unowned venue becomes its merchant.
 * Validation-phase convenience (single test café, Valentin claims it once);
 * real merchant onboarding replaces this post-validation.
 * Returns true if the claim succeeded, false if the venue already has an owner.
 */
export async function claimVenueOwnership(
  venueId: string,
  identityId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('venues')
    .update({ owner_identity_id: identityId })
    .eq('id', venueId)
    .is('owner_identity_id', null)
    .select('id');
  if (error) throw new Error(`[Supabase] claimVenueOwnership: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// --- Identity ----------------------------------------------------------------

// Unambiguous alphabet (no 0/O, 1/I/L) — barista-friendly to read and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Cryptographically secure code generator. MUST NOT use Math.random(): V8's
 * PRNG state is recoverable from a handful of observed outputs, and a merchant
 * legitimately sees many codes — that would let them predict a customer's next
 * redeem code and consume a card without the customer present, defeating the
 * whole proof-of-presence design.
 */
function randomLoyaltyCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Finds or creates the identity row for a Privy DID and guarantees it has a
 * loyalty_code. Retries code generation on the (astronomically rare at our
 * scale) unique collision.
 */
export async function ensureIdentity(
  privyId: string,
  solanaWallet?: string | null
): Promise<IdentityRow> {
  const supa = getSupabaseAdmin();

  const { data: existing, error: readErr } = await supa
    .from('user_identity')
    .select('id, privy_id, loyalty_code, solana_wallet')
    .eq('privy_id', privyId)
    .maybeSingle();
  if (readErr) throw new Error(`[Supabase] ensureIdentity read: ${readErr.message}`);

  if (existing) {
    const row = existing;
    // Backfill pieces that may be missing on older rows.
    const patch: Record<string, unknown> = {};
    if (!row.loyalty_code) patch.loyalty_code = randomLoyaltyCode();
    if (!row.solana_wallet && solanaWallet) patch.solana_wallet = solanaWallet;
    if (Object.keys(patch).length > 0) {
      const { data: updated, error: updErr } = await supa
        .from('user_identity')
        .update(patch)
        .eq('id', row.id)
        .select('id, privy_id, loyalty_code, solana_wallet')
        .single();
      if (updErr) throw new Error(`[Supabase] ensureIdentity update: ${updErr.message}`);
      return updated;
    }
    return row;
  }

  // Insert new identity; retry on loyalty_code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: created, error: insErr } = await supa
      .from('user_identity')
      .insert({
        privy_id: privyId,
        solana_wallet: solanaWallet ?? null,
        loyalty_code: randomLoyaltyCode(),
      })
      .select('id, privy_id, loyalty_code, solana_wallet')
      .single();
    if (!insErr) return created;
    if (insErr.code !== '23505') {
      throw new Error(`[Supabase] ensureIdentity insert: ${insErr.message}`);
    }
    // 23505 could also mean a concurrent insert of the SAME privy_id — re-read.
    const { data: raced } = await supa
      .from('user_identity')
      .select('id, privy_id, loyalty_code, solana_wallet')
      .eq('privy_id', privyId)
      .maybeSingle();
    if (raced) return raced;
  }
  throw new Error('[Supabase] ensureIdentity: could not allocate a loyalty code');
}

export async function getIdentityById(id: string): Promise<IdentityRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('user_identity')
    .select('id, privy_id, loyalty_code, solana_wallet')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getIdentityById: ${error.message}`);
  return (data) ?? null;
}

/**
 * Records (or withdraws) marketing consent. Storing the email is gated on
 * consent: the loyalty service itself runs on the contract basis and never
 * needs a local copy — Privy holds the account email.
 */
export async function setMarketingConsent(
  identityId: string,
  consent: boolean,
  email: string | null,
  version: string
): Promise<void> {
  const patch: Record<string, unknown> = {
    marketing_consent: consent,
    marketing_consent_at: new Date().toISOString(),
    marketing_consent_version: version,
    marketing_email: consent ? email : null,
  };
  const { error } = await getSupabaseAdmin()
    .from('user_identity')
    .update(patch)
    .eq('id', identityId);
  if (error) throw new Error(`[Supabase] setMarketingConsent: ${error.message}`);
}

export async function findIdentityByCode(code: string): Promise<IdentityRow | null> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await getSupabaseAdmin()
    .from('user_identity')
    .select('id, privy_id, loyalty_code, solana_wallet')
    .eq('loyalty_code', normalized)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] findIdentityByCode: ${error.message}`);
  return (data) ?? null;
}

// --- Progress ----------------------------------------------------------------

export async function getVenueProgress(
  identityId: string,
  venueId: string
): Promise<VenueProgress> {
  const supa = getSupabaseAdmin();

  const { count: totalStamps, error: stampErr } = await supa
    .from('stamps')
    .select('id', { count: 'exact', head: true })
    .eq('user_identity_id', identityId)
    .eq('venue_id', venueId)
    // Revoked stamps are marked, not deleted, so every balance excludes them.
    .is('revoked_at', null);
  if (stampErr) throw new Error(`[Supabase] progress stamps: ${stampErr.message}`);

  const { data: rewards, error: rewErr } = await supa
    .from('rewards_redeemed')
    .select('stamps_consumed')
    .eq('user_identity_id', identityId)
    .eq('venue_id', venueId);
  if (rewErr) throw new Error(`[Supabase] progress rewards: ${rewErr.message}`);

  const consumed = (rewards ?? []).reduce(
    (sum, r) => sum + Number((r).stamps_consumed ?? 0),
    0
  );
  const total = totalStamps ?? 0;

  return {
    current: Math.max(0, total - consumed),
    totalStamps: total,
    cardsCompleted: rewards?.length ?? 0,
  };
}

/**
 * Trophies minted at this venue today. The anti-Sybil ceiling lives HERE
 * rather than on stamps: a busy café legitimately hands out hundreds of
 * stamps a day, but a real customer only completes a card every ~10 visits,
 * so trophies/day stays small even at high volume. A merchant farming fake
 * accounts, by contrast, shows up immediately.
 */
/**
 * Trophy mints in the last 24h at this venue, counted by ATTEMPT.
 *
 * It used to count completions — rows with an asset id, which is written only
 * after a confirmed Solana transaction returns. That takes seconds, so every
 * redemption arriving inside the window read the same stale number and minted
 * anyway; the ceiling only held against strictly sequential traffic. Counting
 * reservations means spend already in flight is spend already counted.
 */
export async function countTrophiesToday(venueId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await getSupabaseAdmin()
    .from('rewards_redeemed')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .not('trophy_attempted_at', 'is', null)
    .gt('trophy_attempted_at', since);
  if (error) throw new Error(`[Supabase] countTrophiesToday: ${error.message}`);
  return count ?? 0;
}

/**
 * The same count across EVERY venue — the number that actually bounds what the
 * admin keypair can spend in a day. Per-venue ceilings multiply by however many
 * cafés exist, which is not a budget. Passport trophies (migration 016) spend
 * from the same wallet, so they count into the same budget.
 */
export async function countTrophiesTodayGlobal(): Promise<number> {
  const supa = getSupabaseAdmin();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [cards, passport] = await Promise.all([
    supa
      .from('rewards_redeemed')
      .select('id', { count: 'exact', head: true })
      .not('trophy_attempted_at', 'is', null)
      .gt('trophy_attempted_at', since),
    supa
      .from('passport_awards')
      .select('id', { count: 'exact', head: true })
      .gt('trophy_attempted_at', since),
  ]);
  if (cards.error) throw new Error(`[Supabase] countTrophiesTodayGlobal: ${cards.error.message}`);
  if (passport.error) {
    throw new Error(`[Supabase] countTrophiesTodayGlobal passport: ${passport.error.message}`);
  }
  return (cards.count ?? 0) + (passport.count ?? 0);
}

/**
 * Reserves the mint for one reward before any SOL is spent.
 *
 * Conditional on nothing having reserved it yet, so a retry or a concurrent
 * request cannot pay twice for the same reward — which is exactly how the
 * retro-mint script could previously mint a second trophy for a redemption
 * whose asset id failed to save.
 */
export async function reserveTrophyMint(rewardId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('rewards_redeemed')
    .update({ trophy_attempted_at: new Date().toISOString() })
    .eq('id', rewardId)
    .is('trophy_attempted_at', null)
    .select('id');
  if (error) throw new Error(`[Supabase] reserveTrophyMint: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Stamps granted to this user at this venue today (UTC) — soft anti-abuse cap. */
export async function countStampsToday(
  identityId: string,
  venueId: string
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await getSupabaseAdmin()
    .from('stamps')
    .select('id', { count: 'exact', head: true })
    .eq('user_identity_id', identityId)
    .eq('venue_id', venueId)
    .eq('stamp_day', today)
    .is('revoked_at', null);
  if (error) throw new Error(`[Supabase] countStampsToday: ${error.message}`);
  return count ?? 0;
}

// --- Mutations ----------------------------------------------------------------

export async function grantStamps(input: {
  identityId: string;
  venueId: string;
  count: number;
  grantedBy: string;
  source: 'merchant' | 'ntag_tap';
}): Promise<void> {
  const rows = Array.from({ length: input.count }, () => ({
    user_identity_id: input.identityId,
    venue_id: input.venueId,
    source: input.source,
    granted_by: input.grantedBy,
  }));
  const { error } = await getSupabaseAdmin().from('stamps').insert(rows);
  if (error) throw new Error(`[Supabase] grantStamps: ${error.message}`);
}

/** Inserts the redemption row and returns its id (used to attach the trophy). */
/**
 * Correction: removes the customer's most recent stamp from TODAY at this
 * venue (barista tapped +2 instead of +1). Limited to today so an old,
 * legitimately earned history can't be eroded. Returns false when there's
 * nothing from today to remove. Full soft-delete audit arrives with the
 * merchant dashboard phase; for the pilot the API log is the trail.
 */
/**
 * Marks the most recent live stamp from today as revoked, recording who did it.
 *
 * This used to DELETE the row. With one account per venue that was self-harm;
 * with staff seats it became a way for a disgruntled barista to erase a day —
 * deleted rows vanish from the owner's history too, so the shift simply looks
 * quieter. Marking keeps the act visible and attributable, which is the entire
 * reason staff seats exist.
 */
export async function revokeLatestStampToday(
  identityId: string,
  venueId: string,
  revokedBy: string | null
): Promise<boolean> {
  const supa = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supa
    .from('stamps')
    .select('id')
    .eq('user_identity_id', identityId)
    .eq('venue_id', venueId)
    .eq('stamp_day', today)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`[Supabase] revokeLatestStamp find: ${error.message}`);
  if (!data || data.length === 0) return false;

  // Conditional on it still being live, so two simultaneous corrections cannot
  // both claim the same stamp and quietly remove two.
  const { data: updated, error: updErr } = await supa
    .from('stamps')
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq('id', data[0].id)
    .is('revoked_at', null)
    .select('id');
  if (updErr) throw new Error(`[Supabase] revokeLatestStamp: ${updErr.message}`);
  return (updated?.length ?? 0) > 0;
}

export async function redeemReward(input: {
  identityId: string;
  venueId: string;
  stampsConsumed: number;
  rewardType?: string;
}): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from('rewards_redeemed')
    .insert({
      user_identity_id: input.identityId,
      venue_id: input.venueId,
      reward_type: input.rewardType ?? 'free_item',
      stamps_consumed: input.stampsConsumed,
    })
    .select('id')
    .single();
  if (error) throw new Error(`[Supabase] redeemReward: ${error.message}`);
  return (data).id;
}

/** Attaches the minted trophy cNFT to a redemption row. Best-effort caller. */
export async function setRewardTrophy(
  rewardId: string,
  assetId: string,
  txSignature: string
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('rewards_redeemed')
    .update({ trophy_asset_id: assetId, milestone_mint_tx: txSignature })
    .eq('id', rewardId);
  if (error) throw new Error(`[Supabase] setRewardTrophy: ${error.message}`);
}

// --- One-time redeem codes (migration 005) -------------------------------------

const REDEEM_TTL_MS = 5 * 60 * 1000;

export interface RedeemCodeRow {
  id: string;
  user_identity_id: string;
  venue_id: string;
  code: string;
  expires_at: string;
}

/**
 * Issues a fresh one-time redeem code for a user at a venue (5-minute TTL).
 * Any previous unused codes for the same user+venue are deleted first so only
 * one code is live at a time. Retries on the rare active-code collision.
 */
/**
 * The customer's one live redeem code for this venue.
 *
 * Delete-then-insert was two statements, so two concurrent taps both found
 * nothing to delete and both inserted. The old unique index covered the code
 * string alone, which made two live codes for the same card entirely legal —
 * and redeeming both consumed one full card twice: two free items, two mints
 * off our own wallet, two BITS credits, no collision anywhere, because they
 * were different rows.
 *
 * Migration 012 makes (customer, venue) unique among live codes. The insert
 * now either wins or raises 23505, and a collision means a valid code already
 * exists — so we hand that one back. A customer who taps twice gets the same
 * code rather than a second card-worth of value.
 */
export async function createRedeemCode(
  identityId: string,
  venueId: string
): Promise<RedeemCodeRow> {
  const supa = getSupabaseAdmin();
  const SELECT = 'id, user_identity_id, venue_id, code, expires_at';

  // Expire our own stale code first. Scoped to codes that are actually past
  // their TTL, so it can never retire the live one a concurrent request just
  // created.
  const { error: expErr } = await supa
    .from('redeem_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_identity_id', identityId)
    .eq('venue_id', venueId)
    .is('used_at', null)
    .lt('expires_at', new Date().toISOString());
  if (expErr) throw new Error(`[Supabase] createRedeemCode expire: ${expErr.message}`);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supa
      .from('redeem_codes')
      .insert({
        user_identity_id: identityId,
        venue_id: venueId,
        code: randomLoyaltyCode(),
        expires_at: new Date(Date.now() + REDEEM_TTL_MS).toISOString(),
      })
      .select(SELECT)
      .single();
    if (!error) return data;
    if (error.code !== '23505') {
      throw new Error(`[Supabase] createRedeemCode: ${error.message}`);
    }

    // A unique violation is either a code-string collision (retry) or the
    // card already having a live code (return it).
    const { data: live, error: liveErr } = await supa
      .from('redeem_codes')
      .select(SELECT)
      .eq('user_identity_id', identityId)
      .eq('venue_id', venueId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (liveErr) throw new Error(`[Supabase] createRedeemCode read: ${liveErr.message}`);
    if (live) return live;
  }
  throw new Error('[Supabase] createRedeemCode: could not allocate a code');
}

/** Finds a live (unused, unexpired) redeem code for this venue, or null. */
export async function findValidRedeemCode(
  code: string,
  venueId: string
): Promise<RedeemCodeRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('redeem_codes')
    .select('id, user_identity_id, venue_id, code, expires_at')
    .eq('code', code.trim().toUpperCase())
    .eq('venue_id', venueId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`[Supabase] findValidRedeemCode: ${error.message}`);
  return (data) ?? null;
}

/**
 * Atomically consumes a redeem code. Returns false if it was already used —
 * the `.is('used_at', null)` guard makes this the single serialization point
 * for redemption, so N concurrent requests with the same code can never each
 * mint a trophy and credit BITS.
 */
export async function markRedeemCodeUsed(id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('redeem_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', id)
    .is('used_at', null)
    .select('id');
  if (error) throw new Error(`[Supabase] markRedeemCodeUsed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Merchant self-service settings: reward threshold + reward label. Branding
 * jsonb is merged, not replaced, so other keys (accent, tagline) survive.
 */
export async function updateVenueSettings(
  venueId: string,
  input: {
    stampsRequired?: number;
    rewardLabel?: string;
    /** Empty string clears the value. */
    reviewUrl?: string;
    phone?: string;
    /** Public contact, shown to customers on the venue page. */
    email?: string;
    instagram?: string;
    facebook?: string;
    website?: string;
    /** IANA zone; Happy Hour is evaluated against it. */
    timezone?: string;
    /** null clears the schedule. */
    happyHour?: HappyHourConfig | null;
  }
): Promise<void> {
  const supa = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};

  if (input.stampsRequired !== undefined) {
    patch.stamps_required = input.stampsRequired;
  }
  // A real column rather than branding JSON: Happy Hour is evaluated against
  // it on every grant, and the row is already loaded there.
  if (input.timezone !== undefined) {
    patch.timezone = input.timezone;
  }

  const brandingKeysTouched =
    input.rewardLabel !== undefined ||
    input.reviewUrl !== undefined ||
    input.phone !== undefined ||
    input.email !== undefined ||
    input.instagram !== undefined ||
    input.facebook !== undefined ||
    input.website !== undefined ||
    input.happyHour !== undefined;

  if (brandingKeysTouched) {
    const { data, error } = await supa
      .from('venues')
      .select('branding')
      .eq('id', venueId)
      .single();
    if (error) throw new Error(`[Supabase] settings read: ${error.message}`);
    const branding = ((data).branding ??
      {});

    if (input.rewardLabel !== undefined) branding.reward = input.rewardLabel;
    if (input.reviewUrl !== undefined) {
      if (input.reviewUrl === '') delete branding.reviewUrl;
      else branding.reviewUrl = input.reviewUrl;
    }
    // Contact block. An empty string clears the field rather than storing "",
    // so the customer page can simply test for presence.
    for (const key of ['phone', 'email', 'instagram', 'facebook', 'website'] as const) {
      const value = input[key];
      if (value === undefined) continue;
      if (value === '') delete branding[key];
      else branding[key] = value;
    }
    if (input.happyHour !== undefined) {
      if (input.happyHour === null) delete branding.happyHour;
      else branding.happyHour = input.happyHour;
    }
    patch.branding = branding;
  }
  if (Object.keys(patch).length === 0) return;

  const { error: updErr } = await supa.from('venues').update(patch).eq('id', venueId);
  if (updErr) throw new Error(`[Supabase] settings update: ${updErr.message}`);
}

// --- Merchant analytics (per venue) ----------------------------------------------

export interface VenueAnalytics {
  uniqueCustomers: number;
  totalStamps: number;
  stampsLast30: number;
  rewardsClaimed: number;
  /** Customers who came on 2+ distinct days — the loyalty proof number. */
  repeatCustomers: number;
  trophiesMinted: number;
  /** Daily activity, oldest→newest, up to the last 14 active days. */
  daily: Array<{ day: string; stamps: number; customers: number }>;
  /** How many customers sit in each progress bucket right now. */
  progress: { early: number; mid: number; almost: number; full: number };
}

/**
 * The pilot merchant dashboard numbers. Computed in JS from two queries —
 * trivial at validation scale, replaced by SQL aggregates when volume grows.
 * PII-free by construction: only counts, never emails or codes.
 */
export async function getVenueAnalytics(
  venueId: string,
  required: number
): Promise<VenueAnalytics> {
  const supa = getSupabaseAdmin();

  const [{ data: stampRows, error: sErr }, { data: rewardRows, error: rErr }] =
    await Promise.all([
      supa
        .from('stamps')
        .select('user_identity_id, stamp_day, created_at')
        .eq('venue_id', venueId)
        .is('revoked_at', null),
      supa
        .from('rewards_redeemed')
        .select('user_identity_id, stamps_consumed, trophy_asset_id')
        .eq('venue_id', venueId),
    ]);
  if (sErr) throw new Error(`[Supabase] analytics stamps: ${sErr.message}`);
  if (rErr) throw new Error(`[Supabase] analytics rewards: ${rErr.message}`);

  const stamps = (stampRows ?? []) as Array<{
    user_identity_id: string;
    stamp_day: string;
    created_at: string;
  }>;
  const rewards = (rewardRows ?? []) as Array<{
    user_identity_id: string;
    stamps_consumed: number;
    trophy_asset_id: string | null;
  }>;

  const daysByCustomer = new Map<string, Set<string>>();
  const stampsByCustomer = new Map<string, number>();
  const byDay = new Map<string, { stamps: number; customers: Set<string> }>();
  const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let stampsLast30 = 0;

  for (const s of stamps) {
    if (!daysByCustomer.has(s.user_identity_id)) {
      daysByCustomer.set(s.user_identity_id, new Set());
    }
    daysByCustomer.get(s.user_identity_id)!.add(s.stamp_day);
    stampsByCustomer.set(
      s.user_identity_id,
      (stampsByCustomer.get(s.user_identity_id) ?? 0) + 1
    );
    if (!byDay.has(s.stamp_day)) {
      byDay.set(s.stamp_day, { stamps: 0, customers: new Set() });
    }
    const d = byDay.get(s.stamp_day)!;
    d.stamps += 1;
    d.customers.add(s.user_identity_id);
    if (new Date(s.created_at).getTime() > cutoff30) stampsLast30 += 1;
  }

  const consumedByCustomer = new Map<string, number>();
  let trophiesMinted = 0;
  for (const r of rewards) {
    consumedByCustomer.set(
      r.user_identity_id,
      (consumedByCustomer.get(r.user_identity_id) ?? 0) + Number(r.stamps_consumed ?? 0)
    );
    if (r.trophy_asset_id) trophiesMinted += 1;
  }

  const progress = { early: 0, mid: 0, almost: 0, full: 0 };
  for (const [customer, total] of stampsByCustomer) {
    const current = Math.max(0, total - (consumedByCustomer.get(customer) ?? 0));
    if (current <= 0) continue;
    if (current >= required) progress.full += 1;
    else if (current >= required * 0.7) progress.almost += 1;
    else if (current >= required * 0.4) progress.mid += 1;
    else progress.early += 1;
  }

  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([day, d]) => ({ day, stamps: d.stamps, customers: d.customers.size }));

  return {
    uniqueCustomers: daysByCustomer.size,
    totalStamps: stamps.length,
    stampsLast30,
    rewardsClaimed: rewards.length,
    repeatCustomers: [...daysByCustomer.values()].filter((set) => set.size >= 2).length,
    trophiesMinted,
    daily,
    progress,
  };
}

// --- Cross-venue stats (Profile) ------------------------------------------------

export interface UserLoyaltyStats {
  totalStamps: number;
  cardsCompleted: number;
  /** Trophy cNFTs actually minted on-chain (subset of cardsCompleted). */
  trophiesMinted: number;
  /** Every individual reward, newest first — powers the Profile rewards list. */
  rewardsDetail: Array<{
    venueName: string;
    label: string;
    stampsConsumed: number;
    redeemedAt: string;
  }>;
  /** Detail per minted trophy — powers the Profile trophy gallery. */
  trophies: Array<{
    venueName: string;
    edition: number;
    assetId: string;
    /** Solana mint transaction signature (Explorer-linkable proof). */
    mintTx: string | null;
    redeemedAt: string;
  }>;
  venues: Array<{
    slug: string;
    name: string;
    current: number;
    required: number;
    /** Lifetime stamps earned at this venue (incl. consumed ones). */
    totalStamps: number;
    cardsCompleted: number;
    /** The venue's reward, from branding (e.g. "A free coffee"). */
    rewardLabel: string | null;
  }>;
}

/**
 * Aggregates a user's loyalty footprint across all venues. Row volumes are
 * tiny at validation scale, so we fetch and reduce in JS instead of SQL
 * aggregates (Supabase JS has no GROUP BY).
 */
export async function getUserLoyaltyStats(identityId: string): Promise<UserLoyaltyStats> {
  const supa = getSupabaseAdmin();

  const [{ data: stampRows, error: sErr }, { data: rewardRows, error: rErr }] =
    await Promise.all([
      supa
        .from('stamps')
        .select('venue_id')
        .eq('user_identity_id', identityId)
        .is('revoked_at', null),
      supa
        .from('rewards_redeemed')
        .select('venue_id, stamps_consumed, trophy_asset_id, milestone_mint_tx, redeemed_at, reward_type')
        .eq('user_identity_id', identityId)
        .order('redeemed_at', { ascending: true }),
    ]);
  if (sErr) throw new Error(`[Supabase] stats stamps: ${sErr.message}`);
  if (rErr) throw new Error(`[Supabase] stats rewards: ${rErr.message}`);

  const stampsByVenue = new Map<string, number>();
  for (const row of stampRows ?? []) {
    const v = (row).venue_id;
    stampsByVenue.set(v, (stampsByVenue.get(v) ?? 0) + 1);
  }
  const consumedByVenue = new Map<string, number>();
  const cardsByVenue = new Map<string, number>();
  let trophiesMinted = 0;
  const rawTrophies: Array<{
    venueId: string;
    edition: number;
    assetId: string;
    mintTx: string | null;
    redeemedAt: string;
  }> = [];
  const rawRewards: Array<{
    venueId: string;
    label: string;
    stampsConsumed: number;
    redeemedAt: string;
  }> = [];
  for (const row of rewardRows ?? []) {
    const r = row;
    rawRewards.push({
      venueId: r.venue_id,
      // 'free_item' is the pre-snapshot legacy default — not a real label.
      label: r.reward_type && r.reward_type !== 'free_item' ? r.reward_type : '',
      stampsConsumed: Number(r.stamps_consumed ?? 0),
      redeemedAt: r.redeemed_at,
    });
    // Rows arrive oldest-first, so this running count IS the edition number.
    const editionAtVenue = (cardsByVenue.get(r.venue_id) ?? 0) + 1;
    if (r.trophy_asset_id) {
      trophiesMinted += 1;
      rawTrophies.push({
        venueId: r.venue_id,
        edition: editionAtVenue,
        assetId: r.trophy_asset_id,
        mintTx: r.milestone_mint_tx,
        redeemedAt: r.redeemed_at,
      });
    }
    consumedByVenue.set(
      r.venue_id,
      (consumedByVenue.get(r.venue_id) ?? 0) + Number(r.stamps_consumed ?? 0)
    );
    cardsByVenue.set(r.venue_id, (cardsByVenue.get(r.venue_id) ?? 0) + 1);
  }

  const venueIds = [...new Set([...stampsByVenue.keys(), ...cardsByVenue.keys()])];
  let venueRows: Array<{
    id: string;
    slug: string;
    name: string;
    stamps_required: number;
    branding: Record<string, unknown> | null;
  }> = [];
  if (venueIds.length > 0) {
    const { data, error } = await supa
      .from('venues')
      .select('id, slug, name, stamps_required, branding')
      .in('id', venueIds);
    if (error) throw new Error(`[Supabase] stats venues: ${error.message}`);
    venueRows = (data ?? []);
  }

  const venues = venueRows.map((v) => ({
    slug: v.slug,
    name: v.name,
    current: Math.max(0, (stampsByVenue.get(v.id) ?? 0) - (consumedByVenue.get(v.id) ?? 0)),
    required: v.stamps_required,
    totalStamps: stampsByVenue.get(v.id) ?? 0,
    cardsCompleted: cardsByVenue.get(v.id) ?? 0,
    rewardLabel:
      typeof v.branding?.reward === 'string' ? (v.branding.reward) : null,
  }));

  const venueNameById = new Map(venueRows.map((v) => [v.id, v.name]));
  const trophies = rawTrophies.map((t) => ({
    venueName: venueNameById.get(t.venueId) ?? 'Partner venue',
    edition: t.edition,
    assetId: t.assetId,
    mintTx: t.mintTx,
    redeemedAt: t.redeemedAt,
  }));
  const rewardsDetail = rawRewards
    .map((r) => ({
      venueName: venueNameById.get(r.venueId) ?? 'Partner venue',
      label: r.label,
      stampsConsumed: r.stampsConsumed,
      redeemedAt: r.redeemedAt,
    }))
    .reverse(); // rows arrive oldest-first → newest first for display

  return {
    totalStamps: [...stampsByVenue.values()].reduce((a, b) => a + b, 0),
    cardsCompleted: [...cardsByVenue.values()].reduce((a, b) => a + b, 0),
    trophiesMinted,
    rewardsDetail,
    trophies,
    venues,
  };
}

// --- Merchant transaction history (per venue) -------------------------------

export interface VenueHistoryEvent {
  kind: 'stamp' | 'reward' | 'revoke';
  /** ISO timestamp of the event. */
  at: string;
  /** The customer's anonymous 6-char loyalty code — never a name or email. */
  code: string;
  /** Stamps only: how the stamp was granted. */
  source?: string;
  /** Stamps only: whether this stamp was later corrected away. */
  revoked?: boolean;
  /** Rewards only. */
  stampsConsumed?: number;
  trophyAssetId?: string | null;
  /**
   * Who granted it, as a label the owner can act on: 'owner' for the venue
   * owner's own account, otherwise the staff member's loyalty code. Null for
   * rows written before granted_by existed.
   */
  grantedBy: string | null;
}

export interface VenueHistoryQuery {
  /** Inclusive lower bound, ISO date or timestamp. */
  from?: string;
  /** Exclusive upper bound, ISO date or timestamp. */
  to?: string;
  /** Restrict to a single customer's loyalty code. */
  code?: string;
  /** Restrict to one team member, by the staff display name shown in the UI. */
  by?: string;
  limit: number;
  ownerIdentityId: string | null;
}

const UNKNOWN_CODE = '------';

/**
 * The venue's own transaction log: every stamp and every reward it handed out,
 * newest first. This is the merchant's sales ledger, not a customer profile —
 * people appear only as the anonymous code the staff already sees at the
 * counter, and nothing from other venues is ever included.
 *
 * Merged in JS from two ordered queries. Each side is capped at `limit`, so the
 * merged result is complete for the window whenever either side has fewer than
 * `limit` rows in it — true for any real café day, and the UI narrows the range
 * rather than paging.
 */
export async function getVenueHistory(
  venueId: string,
  q: VenueHistoryQuery
): Promise<VenueHistoryEvent[]> {
  const supa = getSupabaseAdmin();

  // A code filter resolves to an identity first; an unknown code has no
  // history rather than silently returning everything.
  let onlyIdentityId: string | null = null;
  if (q.code) {
    const identity = await findIdentityByCode(q.code);
    if (!identity) return [];
    onlyIdentityId = identity.id;
  }

  let stampQ = supa
    .from('stamps')
    .select('user_identity_id, granted_by, source, created_at, revoked_at, revoked_by')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false })
    .limit(q.limit);
  let rewardQ = supa
    .from('rewards_redeemed')
    .select('user_identity_id, stamps_consumed, trophy_asset_id, redeemed_at')
    .eq('venue_id', venueId)
    .order('redeemed_at', { ascending: false })
    .limit(q.limit);

  if (q.from) {
    stampQ = stampQ.gte('created_at', q.from);
    rewardQ = rewardQ.gte('redeemed_at', q.from);
  }
  if (q.to) {
    stampQ = stampQ.lt('created_at', q.to);
    rewardQ = rewardQ.lt('redeemed_at', q.to);
  }
  if (onlyIdentityId) {
    stampQ = stampQ.eq('user_identity_id', onlyIdentityId);
    rewardQ = rewardQ.eq('user_identity_id', onlyIdentityId);
  }

  const [{ data: stampRows, error: sErr }, { data: rewardRows, error: rErr }] =
    await Promise.all([stampQ, rewardQ]);
  if (sErr) throw new Error(`[Supabase] history stamps: ${sErr.message}`);
  if (rErr) throw new Error(`[Supabase] history rewards: ${rErr.message}`);

  const stamps = (stampRows ?? []) as Array<{
    user_identity_id: string;
    granted_by: string | null;
    source: string | null;
    created_at: string;
    revoked_at: string | null;
    revoked_by: string | null;
  }>;
  const rewards = (rewardRows ?? []) as Array<{
    user_identity_id: string;
    stamps_consumed: number;
    trophy_asset_id: string | null;
    redeemed_at: string;
  }>;

  // One lookup for every identity referenced, so the merge below never issues
  // a query per row.
  const ids = new Set<string>();
  const granterIds = new Set<string>();
  for (const s of stamps) {
    ids.add(s.user_identity_id);
    if (s.granted_by) granterIds.add(s.granted_by);
    if (s.revoked_by) granterIds.add(s.revoked_by);
  }
  for (const r of rewards) ids.add(r.user_identity_id);

  const codeById = new Map<string, string>();
  if (ids.size > 0) {
    const { data: idRows, error: iErr } = await supa
      .from('user_identity')
      .select('id, loyalty_code')
      .in('id', [...ids]);
    if (iErr) throw new Error(`[Supabase] history identities: ${iErr.message}`);
    for (const row of (idRows ?? []) as Array<{ id: string; loyalty_code: string | null }>) {
      codeById.set(row.id, row.loyalty_code ?? UNKNOWN_CODE);
    }
  }

  // Who granted it, by their STAFF NAME — never by their personal loyalty
  // code. A barista who also buys coffee here uses that code as a customer;
  // printing it in the "by" column would let the owner paste it into the
  // customer filter and read their own employee's purchase history. The
  // pseudonym only works while nothing maps it back to a person.
  const staffNameById = new Map<string, string>();
  if (granterIds.size > 0) {
    const { data: staffRows } = await supa
      .from('venue_staff')
      .select('identity_id, display_name')
      .eq('venue_id', venueId)
      .in('identity_id', [...granterIds]);
    for (const row of (staffRows ?? []) as Array<{
      identity_id: string | null;
      display_name: string;
    }>) {
      if (row.identity_id) staffNameById.set(row.identity_id, row.display_name);
    }
  }

  const granterLabel = (id: string | null): string | null => {
    if (!id) return null;
    if (q.ownerIdentityId && id === q.ownerIdentityId) return 'owner';
    return staffNameById.get(id) ?? 'staff';
  };

  // Narrowing to one team member happens after labelling, because the label is
  // the staff name the owner actually sees - filtering on an identity id would
  // mean the UI passing around ids it has no business holding.
  const matchesBy = (label: string | null): boolean =>
    !q.by || (label !== null && label.toLowerCase() === q.by.toLowerCase());

  const events: VenueHistoryEvent[] = [
    ...stamps
      .filter((s) => matchesBy(granterLabel(s.granted_by)))
      .map((s) => ({
      kind: 'stamp' as const,
      at: s.created_at,
      code: codeById.get(s.user_identity_id) ?? UNKNOWN_CODE,
      source: s.source ?? undefined,
      grantedBy: granterLabel(s.granted_by),
      revoked: Boolean(s.revoked_at),
    })),
    // A correction is an event in its own right, at the moment it happened —
    // not the silent disappearance of the stamp it undid.
    ...stamps
      .filter((s) => s.revoked_at && matchesBy(granterLabel(s.revoked_by)))
      .map((s) => ({
        kind: 'revoke' as const,
        at: s.revoked_at as string,
        code: codeById.get(s.user_identity_id) ?? UNKNOWN_CODE,
        grantedBy: granterLabel(s.revoked_by),
      })),
    // A reward has no granter, so a "by" filter excludes them by construction.
    ...(q.by ? [] : rewards).map((r) => ({
      kind: 'reward' as const,
      at: r.redeemed_at,
      code: codeById.get(r.user_identity_id) ?? UNKNOWN_CODE,
      stampsConsumed: Number(r.stamps_consumed ?? 0),
      trophyAssetId: r.trophy_asset_id,
      grantedBy: null,
    })),
  ];

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events.slice(0, q.limit);
}

// --- Shift summary (counter view) -------------------------------------------

export interface VenueToday {
  stamps: number;
  rewards: number;
  customers: number;
  /** Local-day boundary the counts were taken from, ISO. */
  since: string;
}

/**
 * What happened at this venue today. Deliberately counts only — this is shown
 * to staff as well as the owner, and a shift summary has no business carrying
 * customer codes.
 *
 * `sinceIso` comes from the client's local midnight: a café's "today" ends
 * when they close, not when UTC rolls over.
 */
export async function getVenueToday(venueId: string, sinceIso: string): Promise<VenueToday> {
  const supa = getSupabaseAdmin();
  const [{ data: stampRows, error: sErr }, { count: rewardCount, error: rErr }] =
    await Promise.all([
      supa
        .from('stamps')
        .select('user_identity_id')
        .eq('venue_id', venueId)
        .is('revoked_at', null)
        .gte('created_at', sinceIso),
      supa
        .from('rewards_redeemed')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .gte('redeemed_at', sinceIso),
    ]);
  if (sErr) throw new Error(`[Supabase] venueToday stamps: ${sErr.message}`);
  if (rErr) throw new Error(`[Supabase] venueToday rewards: ${rErr.message}`);

  const rows = (stampRows ?? []) as Array<{ user_identity_id: string }>;
  return {
    stamps: rows.length,
    rewards: rewardCount ?? 0,
    customers: new Set(rows.map((r) => r.user_identity_id)).size,
    since: sinceIso,
  };
}

// --- Idempotency -------------------------------------------------------------

/**
 * Claims a request id for one logical operation. Returns true the first time
 * and false for every replay.
 *
 * A café's wifi drops, the reply to a grant never arrives, the client retries.
 * That retry is correct behaviour and must not produce a second stamp — the
 * insert either wins or collides, and the collision is the answer.
 */
export async function claimRequestId(key: string, scope: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from('idempotency_keys')
    .insert({ key, scope });
  if (!error) return true;
  // 23505 = unique violation: someone (probably this same tap) got here first.
  if (error.code === '23505') return false;
  throw new Error(`[Supabase] claimRequestId: ${error.message}`);
}
