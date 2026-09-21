import { timingSafeEqual } from 'node:crypto';

import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { getVenueBySlug } from '../lib/loyalty-db.js';
import {
  billingPeriod,
  completeInvoice,
  getVenueBilling,
  listInvoices,
  listVenueBilling,
  markInvoicePaid,
  periodLabel,
  ANNUAL_MONTHS_PAID,
  releaseInvoice,
  reserveInvoice,
  upsertVenueBilling,
  venuesDueForInvoice,
  type BillableVenue,
} from '../lib/billing-db.js';
import { issueInvoice, oblioStatus, OblioApiError } from '../lib/oblio.js';

// Subscription invoicing.
// ---------------------------------------------------------------------------
// Two routers, because two very different callers:
//
//   billingAdminRouter — mounted under /api/admin/billing, inheriting the
//                        admin allowlist. This is the operator's screen.
//   billingCronRouter  — mounted at /api/billing, guarded by a shared secret,
//                        because a GitHub Action has no Privy session.
//
// The safety model, in order:
//   1. Nothing is issued unless OBLIO_DRY_RUN is explicitly "0".
//   2. The month is reserved in Postgres BEFORE Oblio is called, so a double
//      run loses on a unique index instead of producing two documents.
//   3. A failed Oblio call releases the reservation, so a blip doesn't lock
//      the café out of being invoiced for the rest of the month.
//   4. A venue still inside its free trial, or not marked 'active', is
//      skipped — being invoiced during the free pilot is the worst possible
//      first impression.

export const billingAdminRouter = Router();
export const billingCronRouter = Router();

function serverError(res: Response, scope: string, err: unknown): void {
  console.error(`[billing.${scope}]`, (err as Error).message);
  res.status(500).json({ ok: false, error: 'server_error', message: 'Something went wrong.' });
}

/** Payment terms: invoices are due 15 days out. */
const DUE_DAYS = 15;

function isoDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const PLAN_LABEL: Record<string, string> = {
  starter: 'Starter',
  branded: 'Branded',
  growth: 'Growth',
  chain: 'Chain',
  founding: 'Founding Partner',
};

function planFromFee(fee: number): string {
  if (fee >= 699) return 'chain';
  if (fee >= 299) return 'growth';
  if (fee >= 199) return 'branded';
  return 'starter';
}

// --- The core: issue one invoice for one venue for one period ---------------

interface IssueOutcome {
  slug: string;
  name: string;
  period: string;
  status: 'issued' | 'dry_run' | 'already_invoiced' | 'failed';
  amount?: number;
  series?: string | null;
  number?: string | null;
  link?: string | null;
  payload?: Record<string, unknown>;
  message?: string;
}

async function issueForVenue(v: BillableVenue, period: string): Promise<IssueOutcome> {
  const base = { slug: v.slug, name: v.name, period };
  const vat = Number(v.billing.vat_rate ?? 0);
  const now = new Date();
  const due = new Date(now.getTime() + DUE_DAYS * 86_400_000);

  // Reserve first — see the safety model at the top of this file.
  const reserved = await reserveInvoice(
    v.venueId,
    period,
    v.amount,
    'RON',
    due.toISOString()
  );
  if (!reserved) {
    return { ...base, status: 'already_invoiced' };
  }

  try {
    const plan = planFromFee(v.monthlyFee);
    const result = await issueInvoice({
      client: {
        name: v.billing.company_name,
        cif: v.billing.cui,
        rc: v.billing.reg_com ?? undefined,
        address: v.billing.address ?? undefined,
        city: v.billing.city ?? undefined,
        state: v.billing.county ?? undefined,
        country: v.billing.country,
        email: v.billing.invoice_email ?? undefined,
      },
      productName: `Abonament HeroPad — ${PLAN_LABEL[plan] ?? plan}${
        v.billingPeriod === 'annual' ? ' — anual' : ''
      } (${v.name})`,
      periodLabel: v.periodLabel,
      price: v.amount,
      currency: 'RON',
      vatPercentage: vat,
      issueDate: isoDate(now),
      dueDate: isoDate(due),
      // Never auto-email from a dry run, and never before a human has seen
      // one real invoice come out correctly.
      sendEmail: false,
    });

    if (result.dryRun) {
      // A dry run created no document, so it must not hold the month either.
      await releaseInvoice(reserved.id);
      return {
        ...base,
        status: 'dry_run',
        amount: v.amount,
        payload: result.payload,
      };
    }

    await completeInvoice(reserved.id, {
      series: result.seriesName,
      number: result.number,
      link: result.link,
    });
    return {
      ...base,
      status: 'issued',
      amount: v.amount,
      series: result.seriesName,
      number: result.number,
      link: result.link,
    };
  } catch (err) {
    // Give the month back so it can be retried once the cause is fixed.
    await releaseInvoice(reserved.id).catch(() => undefined);
    return {
      ...base,
      status: 'failed',
      message:
        err instanceof OblioApiError ? err.message : (err as Error).message ?? 'Unknown error',
    };
  }
}

async function runBatch(period: string): Promise<IssueOutcome[]> {
  const due = await venuesDueForInvoice();
  const out: IssueOutcome[] = [];
  // Sequential on purpose: a handful of venues, an external fiscal API, and
  // an ordering that stays readable in the logs when something goes wrong.
  for (const v of due) {
    out.push(await issueForVenue(v, period));
  }
  return out;
}

// --- Admin routes ------------------------------------------------------------

// GET /api/admin/billing/overview — every venue, its fee, its invoicing
// details, and the invoice history. One screen for the monthly routine.
billingAdminRouter.get('/overview', async (_req: Request, res: Response) => {
  try {
    const supa = getSupabaseAdmin();
    const { data: venues, error } = await supa
      .from('venues')
      .select('id, slug, name, monthly_fee, billing_status, paid_since, active')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    const [billing, invoices] = await Promise.all([listVenueBilling(), listInvoices()]);
    const billingByVenue = new Map(billing.map((b) => [b.venue_id, b]));

    const period = billingPeriod();
    const invoicedThisPeriod = new Set(
      invoices.filter((i) => i.period === period).map((i) => i.venue_id)
    );

    return res.status(200).json({
      ok: true,
      period,
      periodLabel: periodLabel(period),
      oblio: oblioStatus(),
      venues: (venues ?? []).map((v: Record<string, unknown>) => {
        const b = billingByVenue.get(v.id as string) ?? null;
        return {
          id: v.id,
          slug: v.slug,
          name: v.name,
          active: v.active,
          monthlyFee: Number(v.monthly_fee ?? 0),
          billingStatus: v.billing_status ?? 'trial',
          paidSince: v.paid_since ?? null,
          invoicedThisPeriod: invoicedThisPeriod.has(v.id as string),
          billing: b,
        };
      }),
      invoices: invoices.map((i) => ({
        ...i,
        amount: Number(i.amount),
      })),
    });
  } catch (err) {
    return serverError(res, 'overview', err);
  }
});

const BillingBody = z.object({
  companyName: z.string().trim().min(2).max(160),
  cui: z.string().trim().min(2).max(20),
  regCom: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  county: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  invoiceEmail: z.union([z.string().trim().email().max(160), z.literal('')]).optional(),
  billingDay: z.number().int().min(1).max(28).optional(),
  recurring: z.boolean().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  trialEndsAt: z.union([z.string().datetime(), z.literal('')]).optional(),
  note: z.string().trim().max(500).optional(),
});

// POST /api/admin/billing/venue/:slug — save a venue's invoicing details.
billingAdminRouter.post('/venue/:slug', async (req: Request, res: Response) => {
  try {
    const venue = await getVenueBySlug(req.params.slug);
    if (!venue) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Unknown venue.' });
    }
    const parsed = BillingBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    const d = parsed.data;
    const row = await upsertVenueBilling(venue.id, {
      company_name: d.companyName,
      cui: d.cui,
      reg_com: d.regCom ?? null,
      address: d.address ?? null,
      city: d.city ?? null,
      county: d.county ?? null,
      country: d.country ?? 'Romania',
      invoice_email: d.invoiceEmail ? d.invoiceEmail : null,
      ...(d.billingDay !== undefined ? { billing_day: d.billingDay } : {}),
      ...(d.recurring !== undefined ? { recurring: d.recurring } : {}),
      ...(d.vatRate !== undefined ? { vat_rate: d.vatRate } : {}),
      trial_ends_at: d.trialEndsAt ? d.trialEndsAt : null,
      note: d.note ?? null,
    });
    return res.status(200).json({ ok: true, billing: row });
  } catch (err) {
    return serverError(res, 'save-venue', err);
  }
});

const IssueBody = z.object({
  slug: z.string().trim().min(1).max(80),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

// POST /api/admin/billing/issue — one venue, one month, on demand.
// With OBLIO_DRY_RUN on (the default) this returns the exact payload that
// WOULD be sent and creates nothing. That is how the first invoice gets
// checked before any real one is ever issued.
billingAdminRouter.post('/issue', async (req: Request, res: Response) => {
  try {
    const parsed = IssueBody.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, error: 'invalid_body', message: 'Send { slug, period? }.' });
    }
    const venue = await getVenueBySlug(parsed.data.slug);
    if (!venue) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Unknown venue.' });
    }
    const billing = await getVenueBilling(venue.id);
    if (!billing) {
      return res.status(400).json({
        ok: false,
        error: 'no_billing_details',
        message: 'This venue has no invoicing details yet — fill in the company and CUI first.',
      });
    }
    const fee = Number((venue as { monthly_fee?: number | string }).monthly_fee ?? 0);
    if (!(fee > 0)) {
      return res.status(400).json({
        ok: false,
        error: 'no_fee',
        message: 'This venue has a monthly fee of 0 — set the price before invoicing it.',
      });
    }

    // The manual button respects the venue's billing period too: an annual
    // café pressed by hand gets one annual invoice, never a monthly one.
    const isAnnual = (venue as { billing_period?: string }).billing_period === 'annual';
    const period = parsed.data.period ?? billingPeriod();
    const [py, pm] = period.split('-').map(Number);
    const endM = ((pm + 10) % 12) + 1;
    const endY = pm + 11 > 12 ? py + 1 : py;
    const MONTHS_RO = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const outcome = await issueForVenue(
      {
        venueId: venue.id,
        slug: venue.slug,
        name: venue.name,
        monthlyFee: fee,
        billingStatus: String((venue as { billing_status?: string }).billing_status ?? 'trial'),
        billingPeriod: isAnnual ? 'annual' : 'monthly',
        amount: isAnnual ? fee * ANNUAL_MONTHS_PAID : fee,
        periodLabel: isAnnual
          ? `Abonament anual ${MONTHS_RO[pm - 1]} ${py} – ${MONTHS_RO[endM - 1]} ${endY} (12 luni, 10 plătite)`
          : `Perioada ${periodLabel(period)}`,
        billing,
      },
      period
    );
    return res.status(200).json({ ok: true, result: outcome });
  } catch (err) {
    return serverError(res, 'issue', err);
  }
});

// POST /api/admin/billing/run — the monthly batch, triggered by hand.
billingAdminRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const period =
      typeof req.body?.period === 'string' && /^\d{4}-\d{2}$/.test(req.body.period)
        ? req.body.period
        : billingPeriod();
    const results = await runBatch(period);
    return res.status(200).json({ ok: true, period, results });
  } catch (err) {
    return serverError(res, 'run', err);
  }
});

const PaidBody = z.object({
  paid: z.boolean(),
  method: z.enum(['bank_transfer', 'card', 'cash', 'other']).optional(),
});

// POST /api/admin/billing/invoice/:id/paid — tick an invoice off after the
// bank statement. Reversible: sending { paid: false } undoes a misclick.
billingAdminRouter.post('/invoice/:id/paid', async (req: Request, res: Response) => {
  try {
    const parsed = PaidBody.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, error: 'invalid_body', message: 'Send { paid, method? }.' });
    }
    await markInvoicePaid(
      req.params.id,
      parsed.data.method ?? 'bank_transfer',
      parsed.data.paid
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, 'mark-paid', err);
  }
});

// --- Cron route --------------------------------------------------------------

billingCronRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ ok: false, error: 'rate_limited', message: 'Slow down.' }),
  })
);

/** Constant-time compare, so the secret can't be probed byte by byte. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// POST /api/billing/cron — the scheduled monthly run.
// Guarded by BILLING_CRON_SECRET rather than an admin session, because the
// caller is a GitHub Action. Fails CLOSED: with no secret configured, the
// endpoint refuses everyone rather than running open to the internet.
billingCronRouter.post('/cron', async (req: Request, res: Response) => {
  const expected = (process.env.BILLING_CRON_SECRET ?? '').trim();
  const provided = String(req.get('x-cron-secret') ?? '');
  if (!expected || !provided || !secretMatches(provided, expected)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  try {
    const period = billingPeriod();
    const results = await runBatch(period);
    const summary = {
      issued: results.filter((r) => r.status === 'issued').length,
      dryRun: results.filter((r) => r.status === 'dry_run').length,
      already: results.filter((r) => r.status === 'already_invoiced').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };
    console.log(`[billing.cron] ${period}`, JSON.stringify(summary));
    // A failure has to be visible in the Actions tab, not buried in a 200.
    return res.status(summary.failed > 0 ? 500 : 200).json({
      ok: summary.failed === 0,
      period,
      summary,
      results: results.map(({ payload: _payload, ...rest }) => rest),
    });
  } catch (err) {
    return serverError(res, 'cron', err);
  }
});
