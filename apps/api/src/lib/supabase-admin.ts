import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side Supabase client using the SERVICE ROLE key.
// ----------------------------------------------------------
// Service role bypasses RLS — only ever instantiated in the backend.
// We export typed helpers (findCollectible, recordClaim, …) instead of raw
// query primitives so callers can't accidentally write to the DB in unsafe
// ways and so the SQL stays in one file we can audit.

let admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      '[Supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in apps/api/.env'
    );
  }
  admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

// --- Types -----------------------------------------------------------------

export interface CollectibleRow {
  code: string;
  type: 'figurine_nfc' | 'card_qr' | 'pack_qr';
  character_id: string | null;
  signature: string;
  cnft_template: Record<string, unknown>;
  distribution_channel: string;
}

export interface CharacterRow {
  id: string;
  name: string;
  story_text: string | null;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  vdash_stats: Record<string, unknown>;
}

// --- Collectible lookup ----------------------------------------------------

/** Fetches the collectible row for a code, or null if it doesn't exist. */
export async function findCollectible(code: string): Promise<CollectibleRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('collectibles_catalog')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] findCollectible: ${error.message}`);
  return (data as CollectibleRow) ?? null;
}

/** Fetches a character by id. Used to enrich the cNFT metadata. */
export async function getCharacter(id: string): Promise<CharacterRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('characters')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getCharacter: ${error.message}`);
  return (data as CharacterRow) ?? null;
}

// --- Claims ----------------------------------------------------------------

/** True if a claim row already exists for this code. */
export async function hasBeenClaimed(code: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('claims')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] hasBeenClaimed: ${error.message}`);
  return Boolean(data);
}

export interface RecordClaimInput {
  code: string;
  walletAddress: string;
  cnftMintAddress: string;
  scanMethod: 'nfc' | 'qr_card' | 'qr_pack';
  deviceId?: string;
}

/**
 * Inserts a row in `claims`. Relies on the unique(code) constraint to prevent
 * double-claims under race conditions — if two requests hit the API at the
 * same time, only one insert succeeds and the other gets a duplicate-key
 * error which we surface to the user as "already claimed".
 */
export async function recordClaim(input: RecordClaimInput): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('claims')
    .insert({
      code: input.code,
      wallet_address: input.walletAddress,
      cnft_mint_address: input.cnftMintAddress,
      scan_method: input.scanMethod,
      device_id: input.deviceId ?? null,
      claimed_by_user: null, // legacy column; we identify by wallet now
    });
  if (error) {
    if (error.code === '23505') {
      // unique violation
      throw new Error('Already claimed');
    }
    throw new Error(`[Supabase] recordClaim: ${error.message}`);
  }
}

// --- BITS economy ----------------------------------------------------------

/**
 * Credits BITS to a wallet. Append-only ledger entry + maintained balance row.
 * We avoid `upsert` here because our wallet_address unique guard is a PARTIAL
 * index, which Supabase's `onConflict` parameter cannot target. Explicit
 * select-then-update-or-insert is more verbose but bullet-proof and easy to
 * audit. (Two queries; for hackathon scale concurrency is a non-issue.)
 */
export async function creditBits(
  walletAddress: string,
  amount: number,
  reason: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const supa = getSupabaseAdmin();

  // 1. Append-only ledger entry — always insert.
  const { error: txErr } = await supa.from('bits_transactions').insert({
    wallet_address: walletAddress,
    amount,
    reason,
    metadata,
    user_id: null,
  });
  if (txErr) throw new Error(`[Supabase] creditBits tx: ${txErr.message}`);

  // 2. Maintain materialized balance row.
  const { data: existing, error: readErr } = await supa
    .from('bits_balance')
    .select('id, current_balance, total_earned, total_spent')
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  if (readErr) throw new Error(`[Supabase] creditBits read: ${readErr.message}`);

  if (existing) {
    const newBalance = Number(existing.current_balance ?? 0) + amount;
    const newEarned = Number(existing.total_earned ?? 0) + Math.max(0, amount);
    const { error: updErr } = await supa
      .from('bits_balance')
      .update({
        current_balance: newBalance,
        total_earned: newEarned,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (updErr) throw new Error(`[Supabase] creditBits update: ${updErr.message}`);
  } else {
    const { error: insErr } = await supa.from('bits_balance').insert({
      wallet_address: walletAddress,
      current_balance: amount,
      total_earned: Math.max(0, amount),
      total_spent: 0,
      updated_at: new Date().toISOString(),
      user_id: null,
    });
    if (insErr) throw new Error(`[Supabase] creditBits insert: ${insErr.message}`);
  }
}

/**
 * Reads the BITS balance for a wallet. We compute this as SUM(amount) over
 * the bits_transactions ledger, which is the source of truth and self-heals
 * past claims where the materialized bits_balance row may have failed to
 * update (e.g. the partial-unique-index upsert quirk). For hackathon scale
 * (low write rate), summing on read is cheap and accurate.
 */
/**
 * The ledger itself, newest first — the "where did my BITS come from"
 * accounting the Profile shows. Reasons in the wild: claim, stamp,
 * loyalty_trophy, passport_trophy, referral_inviter, referral_friend.
 */
export async function getBitsHistory(
  walletAddress: string,
  limit = 60
): Promise<Array<{
  amount: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}>> {
  const { data, error } = await getSupabaseAdmin()
    .from('bits_transactions')
    .select('amount, reason, metadata, created_at')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[Supabase] getBitsHistory: ${error.message}`);
  return ((data ?? []) as Array<{
    amount: number;
    reason: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>).map((r) => ({
    amount: Number(r.amount),
    reason: r.reason,
    metadata: r.metadata,
    createdAt: r.created_at,
  }));
}

export async function getBitsBalance(walletAddress: string): Promise<{
  current: number;
  earned: number;
  spent: number;
}> {
  const { data, error } = await getSupabaseAdmin()
    .from('bits_transactions')
    .select('amount')
    .eq('wallet_address', walletAddress);
  if (error) throw new Error(`[Supabase] getBitsBalance: ${error.message}`);

  let earned = 0;
  let spent = 0;
  for (const row of data ?? []) {
    const a = Number(row.amount);
    if (a > 0) earned += a;
    else spent += Math.abs(a);
  }
  return { current: earned - spent, earned, spent };
}

// --- Solana config (Bubblegum tree address etc.) ---------------------------

/** Reads a single key from `solana_config`. */
export async function getSolanaConfig(key: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('solana_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getSolanaConfig: ${error.message}`);
  return data?.value ?? null;
}

/** Writes a single key to `solana_config` (upsert). */
export async function setSolanaConfig(key: string, value: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('solana_config')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`[Supabase] setSolanaConfig: ${error.message}`);
}
