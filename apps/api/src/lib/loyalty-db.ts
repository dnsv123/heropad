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
    .select('id, slug, name, stamps_required, branding, active, owner_identity_id')
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

function randomLoyaltyCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
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

export async function redeemReward(input: {
  identityId: string;
  venueId: string;
  stampsConsumed: number;
  rewardType?: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from('rewards_redeemed').insert({
    user_identity_id: input.identityId,
    venue_id: input.venueId,
    reward_type: input.rewardType ?? 'free_item',
    stamps_consumed: input.stampsConsumed,
  });
  if (error) throw new Error(`[Supabase] redeemReward: ${error.message}`);
}
