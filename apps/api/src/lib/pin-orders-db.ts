import { getSupabaseAdmin } from './supabase-admin.js';

// Physical reward lots (pins) shipped to venues.
// ---------------------------------------------------------------------------
// A venue's stock of a model is DERIVED: sum of lots sent/paid minus claims
// fulfilled at that venue for that item. Nothing is written twice, so the
// number on the admin screen cannot drift from what actually happened.

export interface PinOrderRow {
  id: string;
  venue_id: string;
  reward_id: string;
  qty: number;
  kind: 'starter' | 'purchase';
  unit_price: number | string;
  status: 'planned' | 'sent' | 'paid';
  note: string | null;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
}

const SELECT =
  'id, venue_id, reward_id, qty, kind, unit_price, status, note, created_at, sent_at, paid_at';

export async function listPinOrders(): Promise<PinOrderRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('pin_orders')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`[Supabase] listPinOrders: ${error.message}`);
  return (data ?? []);
}

export async function createPinOrder(input: {
  venueId: string;
  rewardId: string;
  qty: number;
  kind: 'starter' | 'purchase';
  unitPrice: number;
  note?: string | null;
}): Promise<PinOrderRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('pin_orders')
    .insert({
      venue_id: input.venueId,
      reward_id: input.rewardId,
      qty: input.qty,
      kind: input.kind,
      unit_price: input.unitPrice,
      note: input.note ?? null,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(`[Supabase] createPinOrder: ${error.message}`);
  return data;
}

export async function setPinOrderStatus(
  id: string,
  status: 'planned' | 'sent' | 'paid'
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  // Timestamps move forward with the status and clear when it moves back —
  // a misclick on "paid" must be undoable without leaving a false date.
  if (status === 'planned') {
    patch.sent_at = null;
    patch.paid_at = null;
  } else if (status === 'sent') {
    patch.sent_at = now;
    patch.paid_at = null;
  } else {
    patch.paid_at = now;
  }
  const { error } = await getSupabaseAdmin().from('pin_orders').update(patch).eq('id', id);
  if (error) throw new Error(`[Supabase] setPinOrderStatus: ${error.message}`);
}

/** How many of each item were handed over at each venue: "venueId|rewardId" → n. */
export async function fulfilledCountsByVenueItem(): Promise<Map<string, number>> {
  const { data, error } = await getSupabaseAdmin()
    .from('reward_claims')
    .select('venue_id, reward_id')
    .eq('status', 'fulfilled')
    .not('venue_id', 'is', null);
  if (error) throw new Error(`[Supabase] fulfilledCountsByVenueItem: ${error.message}`);
  const map = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ venue_id: string; reward_id: string }>) {
    const k = `${r.venue_id}|${r.reward_id}`;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}
