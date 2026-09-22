import { getSupabaseAdmin } from './supabase-admin.js';

// Milestones on the way to a full card (migration 025).
// ---------------------------------------------------------------------------
// A venue may put a few small rewards BEFORE the full card: "at 3 stamps,
// fries; at 6, a burger". A customer who reaches one asks for it at the
// counter with the same one-time reward code the full card uses; the barista
// validates it; the card keeps going. Milestones never consume stamps and
// never reset the card — only the full card does, and only the full card
// mints a trophy. That is why claims live in their own table: every count
// of "cards completed" in the codebase stays exactly what it was.
//
// A milestone can be claimed once per card: `card_cycle` is the number of
// full cards already closed at that venue when the claim is made, and the
// (customer, venue, at, cycle) unique index is the gate.

export interface MilestoneRow {
  id: string;
  venue_id: string;
  at: number;
  label: string;
  image: string | null;
}

export interface MilestoneInput {
  at: number;
  label: string;
  image: string | null;
}

/** Hard ceiling; the API validates against it too. */
export const MAX_MILESTONES = 4;

export async function listVenueMilestones(venueId: string): Promise<MilestoneRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('venue_milestones')
    .select('id, venue_id, at, label, image')
    .eq('venue_id', venueId)
    .order('at', { ascending: true });
  if (error) throw new Error(`[Supabase] listVenueMilestones: ${error.message}`);
  return (data ?? []);
}

/**
 * Replaces the venue's milestone list. Two statements, not a transaction: the
 * only writer is the owner's settings form, and a failed insert after the
 * delete leaves an empty list the owner can see and re-save, never a half
 * list that looks right.
 */
export async function replaceVenueMilestones(
  venueId: string,
  items: MilestoneInput[]
): Promise<MilestoneRow[]> {
  const supa = getSupabaseAdmin();
  const { error: delErr } = await supa.from('venue_milestones').delete().eq('venue_id', venueId);
  if (delErr) throw new Error(`[Supabase] replaceVenueMilestones(delete): ${delErr.message}`);
  if (items.length === 0) return [];
  const { data, error } = await supa
    .from('venue_milestones')
    .insert(items.map((m) => ({ venue_id: venueId, at: m.at, label: m.label, image: m.image })))
    .select('id, venue_id, at, label, image')
    .order('at', { ascending: true });
  if (error) throw new Error(`[Supabase] replaceVenueMilestones(insert): ${error.message}`);
  return (data ?? []);
}

/** Milestone thresholds this customer already claimed on the current card. */
export async function listClaimedMilestones(
  identityId: string,
  venueId: string,
  cardCycle: number
): Promise<number[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('milestone_claims')
    .select('milestone_at')
    .eq('user_identity_id', identityId)
    .eq('venue_id', venueId)
    .eq('card_cycle', cardCycle);
  if (error) throw new Error(`[Supabase] listClaimedMilestones: ${error.message}`);
  return (data ?? []).map((r) => Number((r).milestone_at));
}

export interface MilestoneState {
  at: number;
  label: string;
  image: string | null;
  /** Already handed over on this card. */
  claimed: boolean;
  /** Stamps are there and it has not been claimed yet. */
  claimable: boolean;
}

/** The venue's milestones as this customer sees them right now. */
export async function milestoneStates(
  identityId: string,
  venueId: string,
  currentStamps: number,
  cardCycle: number
): Promise<MilestoneState[]> {
  const defs = await listVenueMilestones(venueId);
  if (defs.length === 0) return [];
  const claimed = new Set(await listClaimedMilestones(identityId, venueId, cardCycle));
  return defs.map((m) => ({
    at: m.at,
    label: m.label,
    image: m.image,
    claimed: claimed.has(m.at),
    claimable: !claimed.has(m.at) && currentStamps >= m.at,
  }));
}

/**
 * Records a milestone hand-over. Returns false when this card already had it —
 * the unique index decides, so two baristas validating the same code at the
 * same second cannot both win.
 */
export async function claimMilestone(input: {
  identityId: string;
  venueId: string;
  at: number;
  label: string;
  cardCycle: number;
  validatedBy: string;
}): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from('milestone_claims').insert({
    user_identity_id: input.identityId,
    venue_id: input.venueId,
    milestone_at: input.at,
    label: input.label,
    card_cycle: input.cardCycle,
    validated_by: input.validatedBy,
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') return false;
    throw new Error(`[Supabase] claimMilestone: ${error.message}`);
  }
  return true;
}

/** Milestones handed over at this venue since `sinceIso` (for the day tiles). */
export async function countMilestoneClaimsSince(venueId: string, sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from('milestone_claims')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .gte('claimed_at', sinceIso);
  if (error) throw new Error(`[Supabase] countMilestoneClaimsSince: ${error.message}`);
  return count ?? 0;
}
