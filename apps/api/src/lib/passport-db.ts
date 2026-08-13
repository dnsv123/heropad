import { getSupabaseAdmin } from './supabase-admin.js';

// Passport data layer (schema 016).
// ---------------------------------------------------------------------------
// The cross-venue passport: visit N DIFFERENT venues, get a tier trophy.
// Same philosophy as loyalty-db.ts: typed helpers only, service-role client.
// The mint itself never happens here — this module only answers "how many
// venues has this person visited" and guards "this tier is paid exactly once".

export const PASSPORT_TIERS = [
  { threshold: 3, key: 'bronze' },
  { threshold: 5, key: 'silver' },
  { threshold: 8, key: 'gold' },
] as const;

export type PassportTierKey = (typeof PASSPORT_TIERS)[number]['key'];

/** A mint that produced nothing for this long may be retried once. */
const RETRY_COOLDOWN_MS = 10 * 60 * 1000;

export interface PassportAwardRow {
  id: string;
  tier: number;
  venue_count: number;
  bits_awarded: number;
  trophy_asset_id: string | null;
  mint_tx: string | null;
  created_at: string;
}

export interface PassportVenue {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  branding: Record<string, unknown> | null;
  active: boolean;
}

/**
 * Live stamps per venue for one person. The passport counts VENUES, not
 * stamps — `.size` of this map is the visited count — but the album shows
 * the per-venue number too, so one query serves both.
 */
export async function countStampsByVenue(identityId: string): Promise<Map<string, number>> {
  const { data, error } = await getSupabaseAdmin()
    .from('stamps')
    .select('venue_id')
    .eq('user_identity_id', identityId)
    .is('revoked_at', null);
  if (error) throw new Error(`[Supabase] countStampsByVenue: ${error.message}`);
  const byVenue = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ venue_id: string }>) {
    byVenue.set(row.venue_id, (byVenue.get(row.venue_id) ?? 0) + 1);
  }
  return byVenue;
}

export async function getPassportAwards(identityId: string): Promise<PassportAwardRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('passport_awards')
    .select('id, tier, venue_count, bits_awarded, trophy_asset_id, mint_tx, created_at')
    .eq('user_identity_id', identityId)
    .order('tier', { ascending: true });
  if (error) throw new Error(`[Supabase] getPassportAwards: ${error.message}`);
  return data ?? [];
}

/**
 * Claims the right to mint one tier for one person. The UNIQUE (user, tier)
 * constraint is the gate: the insert either wins and returns the row id, or
 * collides (23505) and returns null — a concurrent grant and a passport-page
 * open can never both pay for the same tier.
 */
export async function reservePassportAward(
  identityId: string,
  tier: number,
  venueCount: number
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('passport_awards')
    .insert({ user_identity_id: identityId, tier, venue_count: venueCount })
    .select('id')
    .single();
  if (!error) return data.id;
  if (error.code === '23505') return null;
  throw new Error(`[Supabase] reservePassportAward: ${error.message}`);
}

/**
 * Re-arms a reservation whose mint never produced an asset — an RPC hiccup,
 * or a customer who had no wallet yet. Conditional on the row still being
 * empty AND cold, so only one caller wins the retry and a mint that is merely
 * slow is not paid twice.
 */
export async function reservePassportRetry(awardId: string): Promise<boolean> {
  const coldBefore = new Date(Date.now() - RETRY_COOLDOWN_MS).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('passport_awards')
    .update({ trophy_attempted_at: new Date().toISOString() })
    .eq('id', awardId)
    .is('trophy_asset_id', null)
    .lt('trophy_attempted_at', coldBefore)
    .select('id');
  if (error) throw new Error(`[Supabase] reservePassportRetry: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Attaches the minted cNFT + the BITS actually credited to the award row. */
export async function setPassportTrophy(
  awardId: string,
  assetId: string,
  txSignature: string,
  bitsAwarded: number
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('passport_awards')
    .update({ trophy_asset_id: assetId, mint_tx: txSignature, bits_awarded: bitsAwarded })
    .eq('id', awardId);
  if (error) throw new Error(`[Supabase] setPassportTrophy: ${error.message}`);
}

/**
 * Passport mint reservations in the last 24h — counted into the same global
 * daily budget as card trophies, because they spend from the same admin wallet.
 */
export async function countPassportAttemptsToday(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await getSupabaseAdmin()
    .from('passport_awards')
    .select('id', { count: 'exact', head: true })
    .gt('trophy_attempted_at', since);
  if (error) throw new Error(`[Supabase] countPassportAttemptsToday: ${error.message}`);
  return count ?? 0;
}

/**
 * The album: every active venue, PLUS any inactive venue the person already
 * visited — a stamp already earned keeps its page in the passport even if the
 * café later leaves the program, otherwise the visited count and the album
 * would silently disagree.
 */
export async function listPassportVenues(visitedIds: string[]): Promise<PassportVenue[]> {
  const supa = getSupabaseAdmin();
  const SELECT = 'id, slug, name, address, branding, active';

  const { data: active, error } = await supa
    .from('venues')
    .select(SELECT)
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(`[Supabase] listPassportVenues: ${error.message}`);

  const venues = (active ?? []) as PassportVenue[];
  const have = new Set(venues.map((v) => v.id));
  const missing = visitedIds.filter((id) => !have.has(id));
  if (missing.length > 0) {
    const { data: extra, error: exErr } = await supa
      .from('venues')
      .select(SELECT)
      .in('id', missing);
    if (exErr) throw new Error(`[Supabase] listPassportVenues extra: ${exErr.message}`);
    venues.push(...((extra ?? []) as PassportVenue[]));
  }
  return venues;
}
