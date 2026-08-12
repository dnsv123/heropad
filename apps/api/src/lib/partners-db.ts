// Partner (referral) data layer.
// ---------------------------------------------------------------------------
// A partner brings cafés and earns a share of what those cafés pay. The trust
// problem is the whole design: a contract can promise a percentage, but what
// makes a partner believe it is seeing their own venues and the amount owed,
// derived from the same rows that produce the invoice — not a number typed by
// hand each month.
//
// Two boundaries are enforced here rather than in the UI:
//   - a partner reads ONLY venues whose referred_by is their own id;
//   - a partner never reads customer data of any kind, nor the venue's own
//     statistics, which belong to the café and not to whoever introduced it.

import { randomInt } from 'node:crypto';

import { getSupabaseAdmin } from './supabase-admin.js';

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1

/** A partner onboards on a human schedule, but not an unbounded one. */
export const PARTNER_CLAIM_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface PartnerRow {
  id: string;
  code: string;
  display_name: string;
  city: string | null;
  email: string | null;
  identity_id: string | null;
  claim_token: string | null;
  commission_pct: number;
  exclusive_city: boolean;
  exclusive_until: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface PartnerVenue {
  slug: string;
  name: string;
  city: string | null;
  billingStatus: string;
  monthlyFee: number;
  paidSince: string | null;
  claimed: boolean;
  createdAt: string;
  /** commission_pct applied to the fee — 0 unless the venue is actually paying. */
  commission: number;
}

export interface PartnerSummary {
  partner: {
    code: string;
    displayName: string;
    city: string | null;
    commissionPct: number;
    exclusiveCity: boolean;
    exclusiveUntil: string | null;
    active: boolean;
  };
  venues: PartnerVenue[];
  totals: {
    venuesTotal: number;
    venuesPaying: number;
    venuesTrial: number;
    monthlyCommission: number;
  };
  /** Recorded months — what was actually earned, and what is still owed. */
  payouts: PayoutRow[];
}

const SELECT = `id, code, display_name, city, email, identity_id, claim_token,
  commission_pct, exclusive_city, exclusive_until, active, notes, created_at`;

export function partnerClaimToken(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  return out;
}

/** Referral code from a name + city, e.g. ('Andrei','Sibiu') -> 'SB-ANDREI'. */
export function suggestPartnerCode(name: string, city: string | null): string {
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip diacritics: Brasov -> BR
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  const who = clean(name).slice(0, 10) || 'PARTNER';
  const where = city ? clean(city).slice(0, 2) : '';
  return where ? `${where}-${who}` : who;
}

export async function listPartners(): Promise<PartnerRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('partners')
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`[Supabase] listPartners: ${error.message}`);
  return (data ?? []);
}

export async function getPartnerByCode(code: string): Promise<PartnerRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('partners')
    .select(SELECT)
    .eq('code', code)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getPartnerByCode: ${error.message}`);
  return (data) ?? null;
}

export async function getPartnerByIdentity(identityId: string): Promise<PartnerRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('partners')
    .select(SELECT)
    .eq('identity_id', identityId)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getPartnerByIdentity: ${error.message}`);
  return (data) ?? null;
}

export interface CreatePartnerInput {
  code: string;
  displayName: string;
  city?: string | null;
  email?: string | null;
  commissionPct: number;
  exclusiveCity: boolean;
  exclusiveUntil?: string | null;
  notes?: string | null;
}

export async function createPartner(
  input: CreatePartnerInput
): Promise<{ partner: PartnerRow; claimToken: string }> {
  const claimToken = partnerClaimToken();
  const { data, error } = await getSupabaseAdmin()
    .from('partners')
    .insert({
      code: input.code,
      display_name: input.displayName,
      city: input.city ?? null,
      email: input.email ?? null,
      commission_pct: input.commissionPct,
      exclusive_city: input.exclusiveCity,
      exclusive_until: input.exclusiveUntil ?? null,
      notes: input.notes ?? null,
      claim_token: claimToken,
      claim_expires_at: new Date(Date.now() + PARTNER_CLAIM_TTL_MS).toISOString(),
      active: true,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(`[Supabase] createPartner: ${error.message}`);
  return { partner: data, claimToken };
}

export async function updatePartner(
  id: string,
  patch: Record<string, unknown>
): Promise<PartnerRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('partners')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw new Error(`[Supabase] updatePartner: ${error.message}`);
  return data;
}

export async function resetPartnerClaimToken(id: string): Promise<string> {
  const token = partnerClaimToken();
  await updatePartner(id, {
    claim_token: token,
    claim_expires_at: new Date(Date.now() + PARTNER_CLAIM_TTL_MS).toISOString(),
    identity_id: null,
  });
  return token;
}

/**
 * Bind a logged-in account to a partner using their one-time token.
 *
 * Conditional on claim_token still matching, so two people racing the same
 * token cannot both become the partner — the second update matches no row.
 * Knowing the email of a partner is deliberately not enough to get in.
 */
export async function claimPartnerWithToken(
  token: string,
  identityId: string
): Promise<PartnerRow | null> {
  const supa = getSupabaseAdmin();
  const clean = token.trim().toUpperCase();
  const { data, error } = await supa
    .from('partners')
    .update({ identity_id: identityId, claim_token: null, claim_expires_at: null })
    .eq('claim_token', clean)
    .eq('active', true)
    .gt('claim_expires_at', new Date().toISOString())
    .select(SELECT)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] claimPartner: ${error.message}`);
  return (data) ?? null;
}

/**
 * Everything a partner is allowed to see about their own referrals.
 *
 * Commission accrues only while a venue is actually paying: a venue in its free
 * months shows up (the partner did the work) with a commission of zero, which
 * is both honest and exactly what the contract says.
 */
export async function getPartnerSummary(partner: PartnerRow): Promise<PartnerSummary> {
  const { data, error } = await getSupabaseAdmin()
    .from('venues')
    .select(
      'slug, name, address, billing_status, monthly_fee, paid_since, owner_identity_id, created_at'
    )
    .eq('referred_by', partner.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`[Supabase] partnerVenues: ${error.message}`);

  const rows = (data ?? []) as Array<{
    slug: string;
    name: string;
    address: string | null;
    billing_status: string;
    monthly_fee: number | string | null;
    paid_since: string | null;
    owner_identity_id: string | null;
    created_at: string;
  }>;

  // Money in integer bani, not floats. Rounding each venue and then summing
  // the rounded parts drifts from the exact total — three venues at 99.99 x
  // 25% round to 25.00 each (75.00) where the true total is 74.99. This is
  // the figure a partner is paid from, and the whole point of showing it is
  // that it matches the invoice.
  const rawPct = Number(partner.commission_pct ?? 0);
  const pctBasisPoints = Number.isFinite(rawPct) ? Math.round(rawPct * 100) : 0;
  let totalBani = 0;

  const venues: PartnerVenue[] = rows.map((v) => {
    const rawFee = Number(v.monthly_fee ?? 0);
    const feeBani = Number.isFinite(rawFee) ? Math.round(rawFee * 100) : 0;
    const fee = feeBani / 100;
    const paying = v.billing_status === 'active';
    const commissionBani = paying ? Math.round((feeBani * pctBasisPoints) / 10000) : 0;
    totalBani += commissionBani;
    return {
      slug: v.slug,
      name: v.name,
      city: v.address,
      billingStatus: v.billing_status,
      monthlyFee: fee,
      paidSince: v.paid_since,
      claimed: Boolean(v.owner_identity_id),
      createdAt: v.created_at,
      commission: commissionBani / 100,
    };
  });

  const payouts = await listPayouts(partner.id);

  return {
    payouts,
    partner: {
      code: partner.code,
      displayName: partner.display_name,
      city: partner.city,
      commissionPct: Number(partner.commission_pct ?? 0),
      exclusiveCity: partner.exclusive_city,
      exclusiveUntil: partner.exclusive_until,
      active: partner.active,
    },
    venues,
    totals: {
      venuesTotal: venues.length,
      venuesPaying: venues.filter((v) => v.billingStatus === 'active').length,
      venuesTrial: venues.filter((v) => v.billingStatus === 'trial').length,
      monthlyCommission: totalBani / 100,
    },
  };
}

export type PartnerOverviewRow = PartnerSummary & {
  id: string;
  email: string | null;
  claimed: boolean;
  claimToken: string | null;
};

/** Admin view: every partner with their totals, for the monthly payout run. */
export async function getPartnersOverview(): Promise<PartnerOverviewRow[]> {
  const partners = await listPartners();
  const out: PartnerOverviewRow[] = [];
  for (const p of partners) {
    const summary = await getPartnerSummary(p);
    out.push({
      ...summary,
      id: p.id,
      email: p.email,
      claimed: Boolean(p.identity_id),
      claimToken: p.claim_token,
    });
  }
  return out;
}

// --- Payout ledger -----------------------------------------------------------

export interface PayoutRow {
  id: string;
  period: string;
  amount: number;
  venues: number;
  paidAt: string | null;
  note: string | null;
}

/**
 * A payout is a statement, not a calculation.
 *
 * The live commission figure is derived from today's billing status, so a
 * venue paused on the 28th would erase the month. Writing the month down when
 * it closes is what makes the number something a partner can rely on — and
 * what lets them see, months later, exactly what they were paid and for what.
 */
export async function listPayouts(partnerId: string): Promise<PayoutRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('partner_payouts')
    .select('id, period, amount, venues, paid_at, note')
    .eq('partner_id', partnerId)
    .order('period', { ascending: false });
  if (error) throw new Error(`[Supabase] listPayouts: ${error.message}`);
  return ((data ?? []) as Array<{
    id: string;
    period: string;
    amount: number | string;
    venues: number;
    paid_at: string | null;
    note: string | null;
  }>).map((r) => ({
    id: r.id,
    period: r.period,
    amount: Number(r.amount ?? 0),
    venues: r.venues,
    paidAt: r.paid_at,
    note: r.note,
  }));
}

export interface UpsertPayoutInput {
  partnerId: string;
  period: string;
  amount: number;
  venues: number;
  paidAt?: string | null;
  note?: string | null;
}

/** Record or correct one month. Re-recording a month replaces that month. */
export async function upsertPayout(input: UpsertPayoutInput): Promise<PayoutRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('partner_payouts')
    .upsert(
      {
        partner_id: input.partnerId,
        period: input.period,
        amount: input.amount,
        venues: input.venues,
        paid_at: input.paidAt ?? null,
        note: input.note ?? null,
      },
      { onConflict: 'partner_id,period' }
    )
    .select('id, period, amount, venues, paid_at, note')
    .single();
  if (error) throw new Error(`[Supabase] upsertPayout: ${error.message}`);
  const r = data;
  return {
    id: r.id,
    period: r.period,
    amount: Number(r.amount ?? 0),
    venues: r.venues,
    paidAt: r.paid_at,
    note: r.note,
  };
}

export async function markPayoutPaid(
  id: string,
  partnerId: string,
  paid: boolean
): Promise<boolean> {
  // partner_id in the filter as well as the id, so a payout belonging to
  // someone else cannot be settled by mistake.
  const { data, error } = await getSupabaseAdmin()
    .from('partner_payouts')
    .update({ paid_at: paid ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('partner_id', partnerId)
    .select('id');
  if (error) throw new Error(`[Supabase] markPayoutPaid: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
