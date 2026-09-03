import { randomInt } from 'node:crypto';

import { creditBits, getBitsBalance, getSupabaseAdmin } from './supabase-admin.js';

// The BITS rewards catalog — what BITS actually buy.
// ---------------------------------------------------------------------------
// A claim debits BITS immediately and hands the customer a 6-character code.
// The code is spoken at the counter; the barista enters it; the item changes
// hands. If the customer never shows up, the code expires after 14 days and
// the BITS come back on their own — lazily, the next time their catalog is
// read, so there is no cron to forget about.
//
// Why debit at claim rather than at pickup: a claim is a decision. Holding the
// BITS as "reserved" would mean a second balance concept (available vs.
// pending) leaking into every screen that shows BITS. Debiting, and refunding
// on expiry, keeps one number true everywhere.

export const CLAIM_TTL_DAYS = 14;

export interface RewardItemRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_bits: number;
  stock: number | null;
  venue_ids: string[] | null;
  sort_order: number;
  active: boolean;
}

export interface RewardClaimRow {
  id: string;
  reward_id: string;
  user_identity_id: string;
  wallet_address: string;
  code: string;
  price_bits: number;
  status: 'pending' | 'fulfilled' | 'expired' | 'cancelled';
  venue_id: string | null;
  fulfilled_by: string | null;
  expires_at: string;
  fulfilled_at: string | null;
  created_at: string;
}

// Same unambiguous alphabet as loyalty codes: no 0/O, 1/I/L.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomClaimCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

const ITEM_SELECT =
  'id, slug, name, description, image_url, price_bits, stock, venue_ids, sort_order, active';
const CLAIM_SELECT =
  'id, reward_id, user_identity_id, wallet_address, code, price_bits, status, venue_id, fulfilled_by, expires_at, fulfilled_at, created_at';

export async function listRewardItems(includeInactive = false): Promise<RewardItemRow[]> {
  let q = getSupabaseAdmin()
    .from('reward_items')
    .select(ITEM_SELECT)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`[Supabase] listRewardItems: ${error.message}`);
  return (data ?? []);
}

export async function getRewardItemBySlug(slug: string): Promise<RewardItemRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('reward_items')
    .select(ITEM_SELECT)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getRewardItemBySlug: ${error.message}`);
  return (data) ?? null;
}

export async function upsertRewardItem(
  input: Partial<RewardItemRow> & { slug: string }
): Promise<RewardItemRow> {
  const supa = getSupabaseAdmin();
  const existing = await getRewardItemBySlug(input.slug);
  const patch = { ...input, updated_at: new Date().toISOString() };
  if (existing) {
    const { data, error } = await supa
      .from('reward_items')
      .update(patch)
      .eq('id', existing.id)
      .select(ITEM_SELECT)
      .single();
    if (error) throw new Error(`[Supabase] upsertRewardItem(update): ${error.message}`);
    return data;
  }
  const { data, error } = await supa
    .from('reward_items')
    .insert(patch)
    .select(ITEM_SELECT)
    .single();
  if (error) throw new Error(`[Supabase] upsertRewardItem(insert): ${error.message}`);
  return data;
}

/**
 * Expires this customer's overdue pending claims and refunds them.
 * Called on every catalog read for the customer — cheap (one indexed query)
 * and it means nobody's BITS are ever stuck behind a code they forgot.
 */
export async function expireOverdueClaims(identityId: string): Promise<number> {
  const supa = getSupabaseAdmin();
  const now = new Date().toISOString();

  // The conditional update is the serialization point: a concurrent fulfil
  // on the same row sees status != 'pending' and does nothing.
  const { data, error } = await supa
    .from('reward_claims')
    .update({ status: 'expired' })
    .eq('user_identity_id', identityId)
    .eq('status', 'pending')
    .lt('expires_at', now)
    .select(CLAIM_SELECT);
  if (error) throw new Error(`[Supabase] expireOverdueClaims: ${error.message}`);

  const expired = (data ?? []) as RewardClaimRow[];
  for (const c of expired) {
    await creditBits(c.wallet_address, c.price_bits, 'reward_expired', {
      claim: c.id,
      reward: c.reward_id,
    });
    await restock(c.reward_id, 1);
  }
  return expired.length;
}

async function restock(rewardId: string, by: number): Promise<void> {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('reward_items')
    .select('stock')
    .eq('id', rewardId)
    .single();
  if (error) throw new Error(`[Supabase] restock read: ${error.message}`);
  if (data.stock === null) return; // unlimited — nothing to give back
  const { error: updErr } = await supa
    .from('reward_items')
    .update({ stock: Number(data.stock) + by })
    .eq('id', rewardId);
  if (updErr) throw new Error(`[Supabase] restock: ${updErr.message}`);
}

export async function listMyClaims(identityId: string): Promise<RewardClaimRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('reward_claims')
    .select(CLAIM_SELECT)
    .eq('user_identity_id', identityId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`[Supabase] listMyClaims: ${error.message}`);
  return (data ?? []);
}

export type ClaimOutcome =
  | { ok: true; claim: RewardClaimRow }
  | { ok: false; error: 'not_found' | 'insufficient_bits' | 'out_of_stock' | 'already_pending' };

/**
 * Claims one item for one customer.
 *
 * Order of operations matters:
 *   1. balance check          — cheap, honest rejection
 *   2. stock decrement        — conditional update, fails when it hits 0
 *   3. claim insert           — the unique partial index rejects a second
 *                                pending claim on the same item
 *   4. BITS debit             — only once the row that entitles them exists
 *
 * If 3 fails after 2 succeeded, stock is put back. If 4 fails after 3, the
 * claim is cancelled. Nothing here is a transaction, so each step's failure
 * path undoes the previous one — that is the whole reason the steps are in
 * this order.
 */
export async function claimReward(
  identityId: string,
  walletAddress: string,
  item: RewardItemRow
): Promise<ClaimOutcome> {
  const supa = getSupabaseAdmin();

  const balance = await getBitsBalance(walletAddress);
  if (balance.current < item.price_bits) {
    return { ok: false, error: 'insufficient_bits' };
  }

  // Stock. `stock` null = unlimited; otherwise a conditional decrement that
  // only wins while stock > 0.
  if (item.stock !== null) {
    const { data: dec, error: decErr } = await supa
      .from('reward_items')
      .update({ stock: item.stock - 1 })
      .eq('id', item.id)
      .eq('stock', item.stock) // optimistic: someone else may have taken one
      .gt('stock', 0)
      .select('id');
    if (decErr) throw new Error(`[Supabase] claimReward stock: ${decErr.message}`);
    if ((dec?.length ?? 0) === 0) {
      // Either 0 left, or the count moved under us. Re-read once and retry.
      const fresh = await getRewardItemBySlug(item.slug);
      if (!fresh || fresh.stock === null || fresh.stock <= 0) {
        return { ok: false, error: 'out_of_stock' };
      }
      return claimReward(identityId, walletAddress, fresh);
    }
  }

  const expiresAt = new Date(Date.now() + CLAIM_TTL_DAYS * 86_400_000).toISOString();
  let claim: RewardClaimRow | null = null;

  for (let attempt = 0; attempt < 5 && !claim; attempt++) {
    const { data, error } = await supa
      .from('reward_claims')
      .insert({
        reward_id: item.id,
        user_identity_id: identityId,
        wallet_address: walletAddress,
        code: randomClaimCode(),
        price_bits: item.price_bits,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select(CLAIM_SELECT)
      .single();

    if (!error) {
      claim = data;
      break;
    }
    if ((error as { code?: string }).code !== '23505') {
      await restock(item.id, 1).catch(() => undefined);
      throw new Error(`[Supabase] claimReward insert: ${error.message}`);
    }
    // 23505: either a code collision (retry) or a pending claim already
    // exists for this (customer, item) — which is the double-click guard.
    const { data: pending } = await supa
      .from('reward_claims')
      .select(CLAIM_SELECT)
      .eq('user_identity_id', identityId)
      .eq('reward_id', item.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (pending) {
      await restock(item.id, 1).catch(() => undefined);
      return { ok: false, error: 'already_pending' };
    }
  }

  if (!claim) {
    await restock(item.id, 1).catch(() => undefined);
    throw new Error('[Supabase] claimReward: could not allocate a code');
  }

  try {
    await creditBits(walletAddress, -item.price_bits, 'reward_claim', {
      claim: claim.id,
      reward: item.slug,
    });
  } catch (err) {
    await supa.from('reward_claims').update({ status: 'cancelled' }).eq('id', claim.id);
    await restock(item.id, 1).catch(() => undefined);
    throw err;
  }

  return { ok: true, claim };
}

/**
 * The counter side: a barista types the code, the item changes hands.
 * Returns the claim + item when it was live, null when the code is unknown,
 * expired, or already handed over.
 */
export async function fulfilClaim(
  code: string,
  venueId: string,
  staffIdentityId: string
): Promise<{ claim: RewardClaimRow; item: RewardItemRow } | null> {
  const supa = getSupabaseAdmin();
  const normalized = code.trim().toUpperCase();

  const { data: found, error } = await supa
    .from('reward_claims')
    .select(CLAIM_SELECT)
    .eq('code', normalized)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`[Supabase] fulfilClaim read: ${error.message}`);
  if (!found) return null;
  const claim = found;

  const { data: itemData, error: itemErr } = await supa
    .from('reward_items')
    .select(ITEM_SELECT)
    .eq('id', claim.reward_id)
    .single();
  if (itemErr) throw new Error(`[Supabase] fulfilClaim item: ${itemErr.message}`);
  const item = itemData;

  // Item restricted to specific venues? Then this counter must be one of them.
  if (item.venue_ids && item.venue_ids.length > 0 && !item.venue_ids.includes(venueId)) {
    return null;
  }

  // Conditional update = the single point where two baristas typing the same
  // code at once resolve to exactly one handover.
  const { data: done, error: updErr } = await supa
    .from('reward_claims')
    .update({
      status: 'fulfilled',
      venue_id: venueId,
      fulfilled_by: staffIdentityId,
      fulfilled_at: new Date().toISOString(),
    })
    .eq('id', claim.id)
    .eq('status', 'pending')
    .select(CLAIM_SELECT);
  if (updErr) throw new Error(`[Supabase] fulfilClaim update: ${updErr.message}`);
  if ((done?.length ?? 0) === 0) return null;

  return { claim: (done as RewardClaimRow[])[0], item };
}

/** Admin: every claim, newest first, with the item name joined in. */
export async function listAllClaims(limit = 200): Promise<
  Array<RewardClaimRow & { item_name: string; item_slug: string }>
> {
  const { data, error } = await getSupabaseAdmin()
    .from('reward_claims')
    .select(`${CLAIM_SELECT}, reward_items!inner(name, slug)`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[Supabase] listAllClaims: ${error.message}`);
  // Supabase types an embedded relation as an array even for a many-to-one
  // join; at runtime it is an object. Handle both shapes.
  type Joined = RewardClaimRow & {
    reward_items: { name: string; slug: string } | Array<{ name: string; slug: string }>;
  };
  return ((data ?? []) as unknown as Joined[]).map((r) => {
    const { reward_items, ...rest } = r;
    const ri = Array.isArray(reward_items) ? reward_items[0] : reward_items;
    return { ...rest, item_name: ri?.name ?? '—', item_slug: ri?.slug ?? '' };
  });
}
