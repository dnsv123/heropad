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
}

/** Happy-hour config stored in venues.branding.happyHour. */
export interface HappyHourConfig {
  /** Weekdays 0 (Sun) – 6 (Sat). */
  days: number[];
  /** "HH:MM" 24h, Romania local time. */
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

export async function getVenueBySlug(slug: string): Promise<VenueRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('venues')
    .select('id, slug, name, stamps_required, branding, active, owner_identity_id, gps_lat, gps_lng')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getVenueBySlug: ${error.message}`);
  return (data as VenueRow) ?? null;
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
    const row = existing as IdentityRow;
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
      return updated as IdentityRow;
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
    if (!insErr) return created as IdentityRow;
    if (insErr.code !== '23505') {
      throw new Error(`[Supabase] ensureIdentity insert: ${insErr.message}`);
    }
    // 23505 could also mean a concurrent insert of the SAME privy_id — re-read.
    const { data: raced } = await supa
      .from('user_identity')
      .select('id, privy_id, loyalty_code, solana_wallet')
      .eq('privy_id', privyId)
      .maybeSingle();
    if (raced) return raced as IdentityRow;
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
  return (data as IdentityRow) ?? null;
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
  return (data as IdentityRow) ?? null;
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
    .eq('venue_id', venueId);
  if (stampErr) throw new Error(`[Supabase] progress stamps: ${stampErr.message}`);

  const { data: rewards, error: rewErr } = await supa
    .from('rewards_redeemed')
    .select('stamps_consumed')
    .eq('user_identity_id', identityId)
    .eq('venue_id', venueId);
  if (rewErr) throw new Error(`[Supabase] progress rewards: ${rewErr.message}`);

  const consumed = (rewards ?? []).reduce(
    (sum, r) => sum + Number((r as { stamps_consumed: number }).stamps_consumed ?? 0),
    0
  );
  const total = totalStamps ?? 0;

  return {
    current: Math.max(0, total - consumed),
    totalStamps: total,
    cardsCompleted: rewards?.length ?? 0,
  };
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
    .eq('stamp_day', today);
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
export async function revokeLatestStampToday(
  identityId: string,
  venueId: string
): Promise<boolean> {
  const supa = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supa
    .from('stamps')
    .select('id')
    .eq('user_identity_id', identityId)
    .eq('venue_id', venueId)
    .eq('stamp_day', today)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`[Supabase] revokeLatestStamp find: ${error.message}`);
  if (!data || data.length === 0) return false;

  const { error: delErr } = await supa
    .from('stamps')
    .delete()
    .eq('id', (data[0] as { id: string }).id);
  if (delErr) throw new Error(`[Supabase] revokeLatestStamp delete: ${delErr.message}`);
  return true;
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
  return (data as { id: string }).id;
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
export async function createRedeemCode(
  identityId: string,
  venueId: string
): Promise<RedeemCodeRow> {
  const supa = getSupabaseAdmin();

  const { error: delErr } = await supa
    .from('redeem_codes')
    .delete()
    .eq('user_identity_id', identityId)
    .eq('venue_id', venueId)
    .is('used_at', null);
  if (delErr) throw new Error(`[Supabase] createRedeemCode cleanup: ${delErr.message}`);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supa
      .from('redeem_codes')
      .insert({
        user_identity_id: identityId,
        venue_id: venueId,
        code: randomLoyaltyCode(),
        expires_at: new Date(Date.now() + REDEEM_TTL_MS).toISOString(),
      })
      .select('id, user_identity_id, venue_id, code, expires_at')
      .single();
    if (!error) return data as RedeemCodeRow;
    if (error.code !== '23505') {
      throw new Error(`[Supabase] createRedeemCode: ${error.message}`);
    }
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
  return (data as RedeemCodeRow) ?? null;
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
    /** null clears the schedule. */
    happyHour?: HappyHourConfig | null;
  }
): Promise<void> {
  const supa = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};

  if (input.stampsRequired !== undefined) {
    patch.stamps_required = input.stampsRequired;
  }

  const brandingKeysTouched =
    input.rewardLabel !== undefined ||
    input.reviewUrl !== undefined ||
    input.phone !== undefined ||
    input.happyHour !== undefined;

  if (brandingKeysTouched) {
    const { data, error } = await supa
      .from('venues')
      .select('branding')
      .eq('id', venueId)
      .single();
    if (error) throw new Error(`[Supabase] settings read: ${error.message}`);
    const branding = ((data as { branding: Record<string, unknown> | null }).branding ??
      {}) as Record<string, unknown>;

    if (input.rewardLabel !== undefined) branding.reward = input.rewardLabel;
    if (input.reviewUrl !== undefined) {
      if (input.reviewUrl === '') delete branding.reviewUrl;
      else branding.reviewUrl = input.reviewUrl;
    }
    if (input.phone !== undefined) {
      if (input.phone === '') delete branding.phone;
      else branding.phone = input.phone;
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
        .eq('venue_id', venueId),
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
      supa.from('stamps').select('venue_id').eq('user_identity_id', identityId),
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
    const v = (row as { venue_id: string }).venue_id;
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
    const r = row as {
      venue_id: string;
      stamps_consumed: number;
      trophy_asset_id: string | null;
      milestone_mint_tx: string | null;
      redeemed_at: string;
      reward_type: string | null;
    };
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
    venueRows = (data ?? []) as typeof venueRows;
  }

  const venues = venueRows.map((v) => ({
    slug: v.slug,
    name: v.name,
    current: Math.max(0, (stampsByVenue.get(v.id) ?? 0) - (consumedByVenue.get(v.id) ?? 0)),
    required: v.stamps_required,
    totalStamps: stampsByVenue.get(v.id) ?? 0,
    cardsCompleted: cardsByVenue.get(v.id) ?? 0,
    rewardLabel:
      typeof v.branding?.reward === 'string' ? (v.branding.reward as string) : null,
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
