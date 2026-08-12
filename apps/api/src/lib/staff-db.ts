// Venue staff data layer.
// ---------------------------------------------------------------------------
// stamps.granted_by has recorded who granted every stamp since migration 004,
// but with one account per venue it always said "the owner". Staff accounts are
// what make that column mean something: the owner can finally see which of
// their people gave a card away, which no automatic ceiling can detect.
//
// The split of powers is the point. Staff work the counter; only the owner
// reads statistics, history and settings. An employee has no business reading
// the venue's numbers — and the history is partly a record OF them.

import { randomInt } from 'node:crypto';

import { getSupabaseAdmin } from './supabase-admin.js';

const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no O/0, I/1/L

export type StaffRole = 'staff' | 'manager';

export interface StaffRow {
  id: string;
  venue_id: string;
  identity_id: string | null;
  display_name: string;
  role: StaffRole;
  claim_token: string | null;
  active: boolean;
  created_at: string;
}

const SELECT = 'id, venue_id, identity_id, display_name, role, claim_token, active, created_at';

/** How long an unused activation code stays valid. Bounds brute-force reach. */
export const STAFF_CLAIM_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Eight characters, not six.
 *
 * The audit measured the old code at 29.7 bits, matched against every venue at
 * once — roughly nine million expected guesses across fifty pending seats.
 * Eight characters is 39.6 bits, and combined with the 48h expiry and the
 * per-account attempt limit it is no longer the weak link. Still short enough
 * to read off a slip of paper.
 */
export function staffClaimToken(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  return out;
}

export async function listStaff(venueId: string): Promise<StaffRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('venue_staff')
    .select(SELECT)
    .eq('venue_id', venueId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`[Supabase] listStaff: ${error.message}`);
  return (data ?? []);
}

/** Active staff seats in use — the number the plan limit is compared against. */
export async function countActiveStaff(venueId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from('venue_staff')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('active', true);
  if (error) throw new Error(`[Supabase] countActiveStaff: ${error.message}`);
  return count ?? 0;
}

export async function addStaff(
  venueId: string,
  displayName: string,
  role: StaffRole
): Promise<{ staff: StaffRow; claimToken: string }> {
  const claimToken = staffClaimToken();
  const { data, error } = await getSupabaseAdmin()
    .from('venue_staff')
    .insert({
      venue_id: venueId,
      display_name: displayName,
      role,
      claim_token: claimToken,
      claim_expires_at: new Date(Date.now() + STAFF_CLAIM_TTL_MS).toISOString(),
      active: true,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(`[Supabase] addStaff: ${error.message}`);
  return { staff: data, claimToken };
}

export async function updateStaff(
  id: string,
  venueId: string,
  patch: Record<string, unknown>
): Promise<StaffRow | null> {
  // venue_id in the filter, not just the id: a staff id from another venue
  // must not be editable by this owner even if they somehow learn it.
  const { data, error } = await getSupabaseAdmin()
    .from('venue_staff')
    .update(patch)
    .eq('id', id)
    .eq('venue_id', venueId)
    .select(SELECT)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] updateStaff: ${error.message}`);
  return (data) ?? null;
}

export async function removeStaff(id: string, venueId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('venue_staff')
    .delete()
    .eq('id', id)
    .eq('venue_id', venueId)
    .select('id');
  if (error) throw new Error(`[Supabase] removeStaff: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function resetStaffToken(id: string, venueId: string): Promise<string | null> {
  const token = staffClaimToken();
  const row = await updateStaff(id, venueId, {
    claim_token: token,
    claim_expires_at: new Date(Date.now() + STAFF_CLAIM_TTL_MS).toISOString(),
    identity_id: null,
  });
  return row ? token : null;
}

/**
 * Bind a logged-in account to a staff seat with its one-time code.
 *
 * Conditional on the token still matching, so two people racing the same code
 * cannot both take the seat — the second update matches no row.
 */
export async function claimStaffSeat(
  token: string,
  identityId: string
): Promise<StaffRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('venue_staff')
    .update({ identity_id: identityId, claim_token: null, claim_expires_at: null })
    .eq('claim_token', token.trim().toUpperCase())
    .eq('active', true)
    // Expiry is enforced in the same statement as the match, so an expired
    // code cannot be raced through by a request that read the row earlier.
    .gt('claim_expires_at', new Date().toISOString())
    .select(SELECT)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] claimStaffSeat: ${error.message}`);
  return (data) ?? null;
}

/** The active staff seat this identity holds at this venue, if any. */
export async function getStaffSeat(
  venueId: string,
  identityId: string
): Promise<StaffRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('venue_staff')
    .select(SELECT)
    .eq('venue_id', venueId)
    .eq('identity_id', identityId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getStaffSeat: ${error.message}`);
  return (data) ?? null;
}

/** Any venue where this identity holds an active staff seat (for landing). */
export async function findStaffVenues(identityId: string): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('venue_staff')
    .select('venue_id')
    .eq('identity_id', identityId)
    .eq('active', true);
  if (error) throw new Error(`[Supabase] findStaffVenues: ${error.message}`);
  return ((data ?? []) as Array<{ venue_id: string }>).map((r) => r.venue_id);
}
