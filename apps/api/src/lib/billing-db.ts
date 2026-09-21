import { getSupabaseAdmin } from './supabase-admin.js';

// Billing data access — venue invoicing details + the invoice ledger.
// ---------------------------------------------------------------------------
// Price and status are NOT here. `venues.monthly_fee` / `venues.billing_status`
// already carry them and partner commission is computed from those; a second
// copy would eventually disagree with the first and nobody could tell which
// was right. This module holds what was missing: the company details that go
// on the invoice, and the record of which months were actually invoiced.

export interface VenueBillingRow {
  id: string;
  venue_id: string;
  company_name: string;
  cui: string;
  reg_com: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  country: string;
  invoice_email: string | null;
  billing_day: number;
  recurring: boolean;
  vat_rate: number | string;
  trial_ends_at: string | null;
  note: string | null;
}

export interface InvoiceRow {
  id: string;
  venue_id: string;
  period: string;
  amount: number | string;
  currency: string;
  oblio_series: string | null;
  oblio_number: string | null;
  oblio_link: string | null;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  note: string | null;
}

/** 'YYYY-MM' for a date, in the operator's own calendar (Europe/Bucharest). */
export function billingPeriod(when: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(when);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  return `${y}-${m}`;
}

/** Human label for the invoice line, e.g. "Septembrie 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  const months = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
  ];
  const idx = Number(m) - 1;
  return `${months[idx] ?? m} ${y}`;
}

export async function getVenueBilling(venueId: string): Promise<VenueBillingRow | null> {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('venue_billing')
    .select('*')
    .eq('venue_id', venueId)
    .maybeSingle();
  if (error) throw new Error(`[Supabase] getVenueBilling: ${error.message}`);
  return (data as VenueBillingRow | null) ?? null;
}

export async function upsertVenueBilling(
  venueId: string,
  input: Partial<Omit<VenueBillingRow, 'id' | 'venue_id'>>
): Promise<VenueBillingRow> {
  const supa = getSupabaseAdmin();
  const existing = await getVenueBilling(venueId);

  if (existing) {
    const { data, error } = await supa
      .from('venue_billing')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('venue_id', venueId)
      .select('*')
      .single();
    if (error) throw new Error(`[Supabase] updateVenueBilling: ${error.message}`);
    return data as VenueBillingRow;
  }

  const { data, error } = await supa
    .from('venue_billing')
    .insert({ venue_id: venueId, ...input })
    .select('*')
    .single();
  if (error) throw new Error(`[Supabase] insertVenueBilling: ${error.message}`);
  return data as VenueBillingRow;
}

/**
 * Claims the right to invoice `venueId` for `period`.
 *
 * This is the anti-double-invoice gate, and it runs BEFORE Oblio is called.
 * The unique index on (venue_id, period) means a concurrent run — the cron
 * firing twice, or an impatient second click — loses here and stops, instead
 * of both winning and issuing two fiscal documents for the same month.
 *
 * Returns null when the month is already claimed.
 */
export async function reserveInvoice(
  venueId: string,
  period: string,
  amount: number,
  currency: string,
  dueAt: string | null
): Promise<InvoiceRow | null> {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('venue_invoices')
    .insert({ venue_id: venueId, period, amount, currency, due_at: dueAt })
    .select('*')
    .single();

  if (error) {
    // 23505 = unique violation: this month was already invoiced. Not an error
    // condition — it is the gate doing its job.
    if ((error as { code?: string }).code === '23505') return null;
    throw new Error(`[Supabase] reserveInvoice: ${error.message}`);
  }
  return data as InvoiceRow;
}

/** Fills in what Oblio returned once the document actually exists. */
export async function completeInvoice(
  invoiceId: string,
  oblio: { series: string | null; number: string | null; link: string | null; note?: string }
): Promise<void> {
  const supa = getSupabaseAdmin();
  const { error } = await supa
    .from('venue_invoices')
    .update({
      oblio_series: oblio.series,
      oblio_number: oblio.number,
      oblio_link: oblio.link,
      note: oblio.note ?? null,
    })
    .eq('id', invoiceId);
  if (error) throw new Error(`[Supabase] completeInvoice: ${error.message}`);
}

/**
 * Releases a reservation whose Oblio call failed, so the month can be retried.
 * Without this, one network blip would lock a café out of being invoiced for
 * the rest of the month — the gate protecting us from a duplicate would be
 * protecting us from the invoice itself.
 */
export async function releaseInvoice(invoiceId: string): Promise<void> {
  const supa = getSupabaseAdmin();
  const { error } = await supa.from('venue_invoices').delete().eq('id', invoiceId);
  if (error) throw new Error(`[Supabase] releaseInvoice: ${error.message}`);
}

export async function markInvoicePaid(
  invoiceId: string,
  method: string,
  paid: boolean
): Promise<void> {
  const supa = getSupabaseAdmin();
  const { error } = await supa
    .from('venue_invoices')
    .update({
      paid_at: paid ? new Date().toISOString() : null,
      payment_method: paid ? method : null,
    })
    .eq('id', invoiceId);
  if (error) throw new Error(`[Supabase] markInvoicePaid: ${error.message}`);
}

export async function listInvoices(limit = 200): Promise<InvoiceRow[]> {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('venue_invoices')
    .select('*')
    .order('issued_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[Supabase] listInvoices: ${error.message}`);
  return (data ?? []) as InvoiceRow[];
}

export async function listVenueBilling(): Promise<VenueBillingRow[]> {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa.from('venue_billing').select('*');
  if (error) throw new Error(`[Supabase] listVenueBilling: ${error.message}`);
  return (data ?? []) as VenueBillingRow[];
}

export type BillingPeriod = 'monthly' | 'annual';

/** Annual = ten months paid, twelve served. Mirrors apps/web/src/lib/plans.ts. */
export const ANNUAL_MONTHS_PAID = 10;

export interface BillableVenue {
  venueId: string;
  slug: string;
  name: string;
  monthlyFee: number;
  billingStatus: string;
  billingPeriod: BillingPeriod;
  /** What the invoice is for: the monthly fee, or ten of them. */
  amount: number;
  /** Human line for the invoice: "Perioada oct 2026" or "oct 2026 – sep 2027". */
  periodLabel: string;
  billing: VenueBillingRow;
}

/** 'YYYY-MM' in Bucharest time. */
function yearMonth(d: Date): { y: number; m: number } {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
  }).format(d);
  const [y, m] = s.split('-').map(Number);
  return { y, m };
}

const MONTHS_RO = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Who should be invoiced right now.
 *
 * A venue qualifies when: recurring is on, today is at or past its billing
 * day, the fee is above zero, billing_status is 'active', and any free trial
 * has ended. Deliberately conservative — a café invoiced by mistake during
 * its free pilot is the single worst first impression this product can make.
 *
 * Annual venues qualify only in their anniversary month (the month of
 * `paid_since`; the current month if that is unset), for ten months' worth.
 * The (venue_id, period) gate then guarantees one such invoice per year.
 */
export async function venuesDueForInvoice(now: Date = new Date()): Promise<BillableVenue[]> {
  const supa = getSupabaseAdmin();
  const { data: billingRows, error: bErr } = await supa
    .from('venue_billing')
    .select('*')
    .eq('recurring', true);
  if (bErr) throw new Error(`[Supabase] venuesDueForInvoice(billing): ${bErr.message}`);

  const rows = (billingRows ?? []) as VenueBillingRow[];
  if (rows.length === 0) return [];

  const { data: venues, error: vErr } = await supa
    .from('venues')
    .select('id, slug, name, monthly_fee, billing_status, billing_period, paid_since')
    .in('id', rows.map((r) => r.venue_id));
  if (vErr) throw new Error(`[Supabase] venuesDueForInvoice(venues): ${vErr.message}`);

  const byId = new Map(
    ((venues ?? []) as Array<{
      id: string;
      slug: string;
      name: string;
      monthly_fee: number | string | null;
      billing_status: string | null;
      billing_period: string | null;
      paid_since: string | null;
    }>).map((v) => [v.id, v])
  );

  const dayNow = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', day: '2-digit' })
      .format(now)
  );
  const { y: yNow, m: mNow } = yearMonth(now);

  const due: BillableVenue[] = [];
  for (const b of rows) {
    const v = byId.get(b.venue_id);
    if (!v) continue;
    if ((v.billing_status ?? 'trial') !== 'active') continue;
    const fee = Number(v.monthly_fee ?? 0);
    if (!(fee > 0)) continue;
    if (dayNow < b.billing_day) continue;
    if (b.trial_ends_at && new Date(b.trial_ends_at).getTime() > now.getTime()) continue;

    const period: BillingPeriod = v.billing_period === 'annual' ? 'annual' : 'monthly';
    if (period === 'annual') {
      // Anniversary month only. paid_since is 'YYYY-MM-DD'; unset = now.
      const anniv = v.paid_since ? Number(v.paid_since.slice(5, 7)) : mNow;
      if (anniv !== mNow) continue;
      const endM = ((mNow + 10) % 12) + 1; // eleven months on, inclusive
      const endY = mNow + 11 > 12 ? yNow + 1 : yNow;
      due.push({
        venueId: b.venue_id,
        slug: v.slug,
        name: v.name,
        monthlyFee: fee,
        billingStatus: v.billing_status ?? 'trial',
        billingPeriod: 'annual',
        amount: fee * ANNUAL_MONTHS_PAID,
        periodLabel: `Abonament anual ${MONTHS_RO[mNow - 1]} ${yNow} – ${MONTHS_RO[endM - 1]} ${endY} (12 luni, 10 plătite)`,
        billing: b,
      });
      continue;
    }

    due.push({
      venueId: b.venue_id,
      slug: v.slug,
      name: v.name,
      monthlyFee: fee,
      billingStatus: v.billing_status ?? 'trial',
      billingPeriod: 'monthly',
      amount: fee,
      periodLabel: `Perioada ${MONTHS_RO[mNow - 1]} ${yNow}`,
      billing: b,
    });
  }
  return due;
}
