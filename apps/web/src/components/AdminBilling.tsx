import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '../lib/auth';

import { getJson, postJson } from '../services/apiClient';
import InfoTip from './InfoTip';

// Admin → Billing. The monthly routine on one screen: who owes what, which
// invoices went out, and which of them came back paid.
//
// The screen is deliberately blunt about the dry run. Issuing an invoice is
// not like saving a setting — it produces a document with legal weight, in a
// real company's name, that an accountant will read. So the state of
// OBLIO_DRY_RUN is shown at the top in plain words, and the "issue" button
// says which of the two things it is about to do.

interface BillingDetails {
  id: string;
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

interface BillingVenue {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  monthlyFee: number;
  billingStatus: string;
  paidSince: string | null;
  invoicedThisPeriod: boolean;
  billing: BillingDetails | null;
}

interface Invoice {
  id: string;
  venue_id: string;
  period: string;
  amount: number;
  currency: string;
  oblio_series: string | null;
  oblio_number: string | null;
  oblio_link: string | null;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
}

interface OverviewResponse {
  ok: true;
  period: string;
  periodLabel: string;
  oblio: {
    configured: boolean;
    dryRun: boolean;
    missing: string[];
    series: string | null;
    priceIncludesVat: boolean;
  };
  venues: BillingVenue[];
  invoices: Invoice[];
}

interface IssueResult {
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

const money = (n: number) =>
  `${n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`;

/**
 * Romanian CUI check digit (key 753217532).
 *
 * A warning, never a block: foreign clients and a handful of legacy numbers
 * don't follow it, and refusing to save a real client because our arithmetic
 * disagrees would be worse than a wrong invoice we can reissue. It exists to
 * catch the typo — one transposed digit sends the invoice to another company.
 */
function cuiLooksValid(raw: string): boolean {
  const digits = raw.trim().toUpperCase().replace(/^RO/, '').replace(/\D/g, '');
  // Below 4 digits the check digit stops discriminating — "361" passes the
  // arithmetic by accident. Real company codes are 6–10 digits, so a very
  // short one is a typo worth flagging rather than a number worth blessing.
  if (digits.length < 4 || digits.length > 10) return false;
  const key = [7, 5, 3, 2, 1, 7, 5, 3, 2];
  const control = Number(digits[digits.length - 1]);
  const body = digits.slice(0, -1).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * key[i];
  const computed = (sum * 10) % 11 % 10;
  return computed === control;
}

const shortDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
};

interface Props {
  onNotice: (kind: 'ok' | 'err', text: string) => void;
}

export default function AdminBilling({ onNotice }: Props) {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<IssueResult[] | null>(null);
  const [preview, setPreview] = useState<IssueResult | null>(null);

  // Edit form
  const [fCompany, setFCompany] = useState('');
  const [fCui, setFCui] = useState('');
  const [fReg, setFReg] = useState('');
  const [fAddress, setFAddress] = useState('');
  const [fCity, setFCity] = useState('');
  const [fCounty, setFCounty] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fDay, setFDay] = useState('1');
  const [fVat, setFVat] = useState('0');
  const [fRecurring, setFRecurring] = useState(true);
  const [fTrialEnds, setFTrialEnds] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const r = await getJson<OverviewResponse>(
        '/api/admin/billing/overview',
        token ?? undefined
      );
      setData(r);
    } catch (err) {
      onNotice('err', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = (v: BillingVenue) => {
    const b = v.billing;
    setEditing(v.slug);
    setFCompany(b?.company_name ?? v.name);
    setFCui(b?.cui ?? '');
    setFReg(b?.reg_com ?? '');
    setFAddress(b?.address ?? '');
    setFCity(b?.city ?? '');
    setFCounty(b?.county ?? '');
    setFEmail(b?.invoice_email ?? '');
    setFDay(String(b?.billing_day ?? 1));
    setFVat(String(b?.vat_rate ?? 0));
    setFRecurring(b?.recurring ?? true);
    setFTrialEnds(b?.trial_ends_at ? b.trial_ends_at.slice(0, 10) : '');
  };

  const saveDetails = async (slug: string) => {
    if (fCompany.trim().length < 2 || fCui.trim().length < 2) {
      onNotice('err', 'Denumirea firmei și CUI-ul sunt obligatorii — fără ele nu există factură.');
      return;
    }
    setBusy(`save:${slug}`);
    try {
      const token = await getAccessToken();
      await postJson(
        `/api/admin/billing/venue/${slug}`,
        {
          companyName: fCompany.trim(),
          cui: fCui.trim(),
          regCom: fReg.trim() || undefined,
          address: fAddress.trim() || undefined,
          city: fCity.trim() || undefined,
          county: fCounty.trim() || undefined,
          invoiceEmail: fEmail.trim(),
          billingDay: Number(fDay) || 1,
          vatRate: Number(fVat) || 0,
          recurring: fRecurring,
          // A date input gives a day; the API wants an instant. End of that
          // day local time, so "trial ends on the 30th" includes the 30th.
          trialEndsAt: fTrialEnds ? new Date(`${fTrialEnds}T23:59:59`).toISOString() : '',
        },
        token ?? undefined
      );
      // Saved either way — filling this in over two sittings is normal. But
      // "saved" must not be mistaken for "ready to invoice": an invoice
      // missing the client's registered address is not a compliant one.
      const missing = [
        !fAddress.trim() && 'adresa',
        !fCity.trim() && 'localitatea',
        !fCounty.trim() && 'județul',
      ].filter(Boolean);
      onNotice(
        'ok',
        missing.length > 0
          ? `Salvat — dar mai lipsesc ${missing.join(', ')}. Fără ele factura nu e conformă.`
          : 'Date de facturare salvate — complete.'
      );
      setEditing(null);
      await load();
    } catch (err) {
      onNotice('err', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const issueOne = async (slug: string) => {
    setBusy(`issue:${slug}`);
    try {
      const token = await getAccessToken();
      const r = await postJson<{ slug: string }, { ok: true; result: IssueResult }>(
        '/api/admin/billing/issue',
        { slug },
        token ?? undefined
      );
      setPreview(r.result);
      if (r.result.status === 'issued') {
        onNotice('ok', `Invoice ${r.result.series ?? ''}${r.result.number ?? ''} issued.`);
      } else if (r.result.status === 'dry_run') {
        onNotice('ok', 'Dry run — nothing was issued. The payload is below.');
      } else if (r.result.status === 'already_invoiced') {
        onNotice('err', 'This venue was already invoiced for this month.');
      } else {
        onNotice('err', r.result.message ?? 'Oblio refused the invoice.');
      }
      await load();
    } catch (err) {
      onNotice('err', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runBatch = async () => {
    setBusy('run');
    try {
      const token = await getAccessToken();
      const r = await postJson<
        Record<string, never>,
        { ok: true; period: string; results: IssueResult[] }
      >('/api/admin/billing/run', {}, token ?? undefined);
      setLastRun(r.results);
      onNotice('ok', `Batch finished — ${r.results.length} venue(s) processed.`);
      await load();
    } catch (err) {
      onNotice('err', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const togglePaid = async (inv: Invoice) => {
    setBusy(`paid:${inv.id}`);
    try {
      const token = await getAccessToken();
      await postJson(
        `/api/admin/billing/invoice/${inv.id}/paid`,
        { paid: !inv.paid_at, method: 'bank_transfer' },
        token ?? undefined
      );
      await load();
    } catch (err) {
      onNotice('err', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) {
    return <p className="mt-8 text-sm text-slate-400">Loading billing…</p>;
  }
  if (!data) return null;

  const venueById = new Map(data.venues.map((v) => [v.id, v]));
  const unpaid = data.invoices.filter((i) => !i.paid_at);
  const owedTotal = unpaid.reduce((s, i) => s + Number(i.amount), 0);
  const monthlyTotal = data.venues
    .filter((v) => v.billingStatus === 'active')
    .reduce((s, v) => s + v.monthlyFee, 0);

  return (
    <div className="mt-8 space-y-6">
      {/* ---- Mode banner: the single most important fact on this screen ---- */}
      <div
        className={`rounded-2xl border p-4 ${
          data.oblio.dryRun
            ? 'border-hero-gold/40 bg-hero-gold/5'
            : 'border-red-400/40 bg-red-500/5'
        }`}
      >
        <p
          className={`font-display text-sm font-semibold ${
            data.oblio.dryRun ? 'text-hero-gold' : 'text-red-300'
          }`}
        >
          {data.oblio.dryRun
            ? '🧪 DRY RUN — nothing is sent to Oblio'
            : '🔴 LIVE — invoices are issued for real in Oblio'}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          {data.oblio.dryRun
            ? 'Every "Issue" here builds the exact payload and shows it to you without contacting Oblio. Read one, check the company data and the amount, then set OBLIO_DRY_RUN=0 on Railway to go live.'
            : 'Each issue creates a real fiscal document. Numbers are consumed from the series and cannot be silently reused.'}
        </p>
        {data.oblio.missing.length > 0 && (
          <p className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">
            Not configured yet — missing on Railway:{' '}
            <span className="font-mono">{data.oblio.missing.join(', ')}</span>
          </p>
        )}
        {data.oblio.series && (
          <p className="mt-1 text-[11px] text-slate-500">
            Series: <span className="font-mono text-slate-300">{data.oblio.series}</span> ·
            Period: <span className="font-mono text-slate-300">{data.periodLabel}</span>
          </p>
        )}
      </div>

      {/* ---- The three numbers ---- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-hero-blue/20 bg-hero-deep/50 p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            Monthly recurring
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-solana-green">
            {money(monthlyTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-hero-blue/20 bg-hero-deep/50 p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Unpaid</p>
          <p className="mt-1 font-display text-2xl font-bold text-hero-gold">
            {money(owedTotal)}
          </p>
          <p className="text-[11px] text-slate-500">{unpaid.length} invoice(s)</p>
        </div>
        <div className="rounded-xl border border-hero-blue/20 bg-hero-deep/50 p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">This month</p>
          <p className="mt-1 font-display text-2xl font-bold text-hero-cyan">
            {data.venues.filter((v) => v.invoicedThisPeriod).length}/
            {data.venues.filter((v) => v.billingStatus === 'active' && v.monthlyFee > 0).length}
          </p>
          <p className="text-[11px] text-slate-500">invoiced</p>
        </div>
      </div>

      <button
        type="button"
        onClick={runBatch}
        disabled={busy === 'run'}
        className="rounded-full bg-hero-gold px-5 py-2 text-sm font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-50"
      >
        {busy === 'run' ? 'Running…' : `▶ Run the monthly batch (${data.periodLabel})`}
      </button>
      <InfoTip
        text="Goes through every venue with recurring on, an active billing status, a fee above zero, a finished trial and a billing day that has arrived — and issues one invoice each. A venue already invoiced this month is stopped by a unique index in the database, so running it twice cannot produce two invoices."
      />

      {lastRun && (
        <div className="rounded-xl border border-hero-blue/20 bg-hero-deep/40 p-4">
          <p className="text-xs font-semibold text-slate-300">Last batch</p>
          <ul className="mt-2 space-y-1 text-[11px]">
            {lastRun.map((r) => (
              <li key={r.slug} className="flex items-baseline justify-between gap-3">
                <span className="text-slate-400">{r.name}</span>
                <span
                  className={
                    r.status === 'issued'
                      ? 'text-solana-green'
                      : r.status === 'failed'
                      ? 'text-red-300'
                      : 'text-slate-500'
                  }
                >
                  {r.status}
                  {r.message ? ` — ${r.message}` : ''}
                </span>
              </li>
            ))}
            {lastRun.length === 0 && (
              <li className="text-slate-500">Nothing was due — no venue matched the rules.</li>
            )}
          </ul>
        </div>
      )}

      {/* ---- Venues ---- */}
      <div>
        <h3 className="font-display text-lg font-semibold text-white">Venues</h3>
        <div className="mt-3 space-y-3">
          {data.venues.map((v) => (
            <div
              key={v.slug}
              className="rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-display font-semibold text-white">
                    {v.name}{' '}
                    <span className="font-mono text-xs text-slate-500">/{v.slug}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {money(v.monthlyFee)}/month · {v.billingStatus}
                    {v.billing ? ` · ${v.billing.company_name} (${v.billing.cui})` : ' · no invoicing details'}
                    {v.billing && !v.billing.recurring ? ' · recurring OFF' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {v.billing && !(v.billing.address && v.billing.city && v.billing.county) && (
                    <span className="rounded-full border border-hero-gold/40 px-2 py-0.5 text-hero-gold">
                      date incomplete
                    </span>
                  )}
                  {v.invoicedThisPeriod && (
                    <span className="rounded-full border border-solana-green/40 px-2 py-0.5 text-solana-green">
                      invoiced {data.period}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => (editing === v.slug ? setEditing(null) : openEditor(v))}
                    className="rounded-full border border-hero-blue/40 px-3 py-1 text-slate-300 transition hover:border-hero-cyan hover:text-white"
                  >
                    {editing === v.slug ? 'Close' : v.billing ? 'Edit details' : 'Add details'}
                  </button>
                  <button
                    type="button"
                    onClick={() => issueOne(v.slug)}
                    disabled={!v.billing || v.monthlyFee <= 0 || busy === `issue:${v.slug}`}
                    className="rounded-full border border-hero-gold/50 px-3 py-1 text-hero-gold transition hover:bg-hero-gold/10 disabled:opacity-40"
                    title={
                      !v.billing
                        ? 'Add the company details first'
                        : v.monthlyFee <= 0
                        ? 'This venue has no monthly fee set'
                        : undefined
                    }
                  >
                    {busy === `issue:${v.slug}`
                      ? '…'
                      : data.oblio.dryRun
                      ? 'Preview invoice'
                      : 'Issue invoice'}
                  </button>
                </div>
              </div>

              {editing === v.slug && (
                <div className="mt-4 space-y-3 border-t border-hero-blue/15 pt-4">
                  {/* What the law actually asks for, said once, at the top —
                      so the asterisks below mean something. */}
                  <div className="rounded-lg border border-hero-blue/20 bg-hero-deep/60 p-3">
                    <p className="text-[11px] font-semibold text-hero-cyan">
                      Ce cere legea pe o factură (Cod fiscal, art. 319)
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Datele <b>furnizorului</b> (noi), numărul și data facturii, cota și
                      suma TVA și totalul vin automat din contul tău Oblio. Aici completezi
                      doar datele <b>beneficiarului</b> — cafeneaua. Obligatorii sunt
                      denumirea, CUI-ul și adresa; restul ajută contabila și pe tine.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      Denumire firmă *
                      <InfoTip text="Denumirea EXACTĂ din certificatul de înregistrare, cu forma juridică: „CAFE VICTOR SRL”, nu „Café Victor”. Numele comercial al localului nu ține loc de denumire legală pe o factură." />
                      <input
                        value={fCompany}
                        onChange={(e) => setFCompany(e.target.value)}
                        placeholder="CAFE VICTOR SRL"
                        className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      CUI / CIF *
                      <InfoTip text="Codul de înregistrare fiscală. Cu prefixul RO dacă firma e plătitoare de TVA, fără dacă nu e — prefixul chiar înseamnă ceva, nu e decorativ. Îl verifici oricând pe anaf.ro." />
                      <input
                        value={fCui}
                        onChange={(e) => setFCui(e.target.value)}
                        placeholder="RO12345678"
                        className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                      />
                      {fCui.trim().length >= 2 && !cuiLooksValid(fCui) && (
                        <span className="mt-1 block text-[11px] text-hero-gold">
                          ⚠ Cifra de control nu iese. Verifică-l — o cifră inversată
                          trimite factura la altă firmă. (Poți salva oricum: firmele
                          străine nu respectă formatul românesc.)
                        </span>
                      )}
                      {fCui.trim().length >= 2 && cuiLooksValid(fCui) && (
                        <span className="mt-1 block text-[11px] text-solana-green">
                          ✓ Format valid
                        </span>
                      )}
                    </label>
                    <label className="text-xs text-slate-500">
                      Nr. Reg. Comerțului
                      <InfoTip text="Formatul J32/123/2020 (J + județ / număr / an). Nu e obligatoriu prin lege pe factură, dar orice contabilă îl așteaptă și îl folosește la identificarea firmei." />
                      <input
                        value={fReg}
                        onChange={(e) => setFReg(e.target.value)}
                        placeholder="J32/123/2020"
                        className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Email pentru factură
                      <InfoTip text="Unde pleacă PDF-ul. De obicei contabilitatea, nu cafeneaua — pune adresa pe care ți-o dă patronul pentru facturi. Dacă o lași goală, factura rămâne doar în Oblio și i-o trimiți tu." />
                      <input
                        value={fEmail}
                        onChange={(e) => setFEmail(e.target.value)}
                        placeholder="contabilitate@cafenea.ro"
                        className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Adresa sediului social *
                      <InfoTip text="Sediul SOCIAL din actele firmei, nu adresa cafenelei — pot fi diferite, și pe factură se trece sediul social. Strada și numărul." />
                      <input
                        value={fAddress}
                        onChange={(e) => setFAddress(e.target.value)}
                        placeholder="Str. Nicolae Bălcescu nr. 12"
                        className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs text-slate-500">
                        Localitate *
                        <input
                          value={fCity}
                          onChange={(e) => setFCity(e.target.value)}
                          placeholder="Sibiu"
                          className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        Județ *
                        <input
                          value={fCounty}
                          onChange={(e) => setFCounty(e.target.value)}
                          placeholder="Sibiu"
                          className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-xs text-slate-500">
                      Ziua de facturare (1–28)
                      <InfoTip text="În ce zi a lunii se emite factura. Maxim 28, ca ziua să existe și în februarie. Jobul rulează în fiecare dimineață și facturează pe cine i-a venit ziua — dacă într-o zi pică ceva, se recuperează a doua zi." />
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={fDay}
                        onChange={(e) => setFDay(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Cota TVA %
                      <InfoTip text="0 dacă firma NOASTRĂ e neplătitoare de TVA — atunci nu ai voie să colectezi TVA, indiferent de clientul din față. Când devii plătitor, treci cota standard. Se schimbă per client doar în cazuri speciale (client extern)." />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={fVat}
                        onChange={(e) => setFVat(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Perioada gratuită se termină
                      <InfoTip text="Cât timp data asta e în viitor, jobul automat SARE peste local. E plasa de siguranță pentru pilotul gratuit de 2 luni: o cafenea facturată din greșeală în perioada gratuită e cea mai proastă primă impresie posibilă." />
                      <input
                        type="date"
                        value={fTrialEnds}
                        onChange={(e) => setFTrialEnds(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                      />
                    </label>
                  </div>

                  {/* The money line, spelled out. "99 lei" means two different
                      totals depending on a setting, and that ambiguity is
                      exactly what turns into an awkward call with a client. */}
                  {v.monthlyFee > 0 && (
                    <div className="rounded-lg border border-hero-gold/25 bg-hero-gold/5 px-3 py-2 text-[11px] leading-relaxed">
                      <span className="text-slate-400">Pe factură va apărea: </span>
                      <span className="font-semibold text-hero-gold">
                        {data.oblio.priceIncludesVat
                          ? `${money(v.monthlyFee)} total de plată${
                              Number(fVat) > 0
                                ? ` (din care ${money(
                                    v.monthlyFee - v.monthlyFee / (1 + Number(fVat) / 100)
                                  )} TVA)`
                                : ', fără TVA'
                            }`
                          : `${money(v.monthlyFee)} + ${fVat}% TVA = ${money(
                              v.monthlyFee * (1 + Number(fVat) / 100)
                            )} de plată`}
                      </span>
                      <InfoTip text="Se schimbă din OBLIO_PRICE_INCLUDES_VAT pe Railway: 1 = prețul e totalul de plată, 0 = prețul e net și TVA-ul se adaugă peste. Atenție la fondatori — lor le-ai promis „99 lei pe lună”, deci contractul trebuie să spună explicit dacă e cu sau fără TVA." />
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={fRecurring}
                      onChange={(e) => setFRecurring(e.target.checked)}
                      className="h-4 w-4 accent-hero-gold"
                    />
                    Invoice this venue automatically every month
                    <InfoTip
                      text="Off means nothing is ever issued automatically for this venue — you can still invoice it by hand with the button above. Its details and its whole invoice history stay exactly as they are. Pausing is not deleting."
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => saveDetails(v.slug)}
                    disabled={busy === `save:${v.slug}`}
                    className="rounded-full bg-hero-cyan px-5 py-2 text-sm font-semibold text-hero-deep transition hover:bg-hero-cyan/80 disabled:opacity-50"
                  >
                    {busy === `save:${v.slug}` ? 'Saving…' : 'Save details'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ---- The payload preview: what a dry run is for ---- */}
      {preview && (
        <div className="rounded-2xl border border-hero-cyan/30 bg-hero-deep/50 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-sm font-semibold text-hero-cyan">
              {preview.status === 'dry_run' ? '🧪 Would send to Oblio' : 'Result'} —{' '}
              {preview.name}
            </p>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Close
            </button>
          </div>
          {preview.link && (
            <a
              href={preview.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block rounded-full border border-solana-green/40 px-3 py-1 text-xs text-solana-green"
            >
              Open the invoice PDF ↗
            </a>
          )}
          {preview.payload && (
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-hero-deep/80 p-3 font-mono text-[10px] leading-relaxed text-slate-300">
              {JSON.stringify(preview.payload, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* ---- Invoice history ---- */}
      <div>
        <h3 className="font-display text-lg font-semibold text-white">Invoices</h3>
        {data.invoices.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            None yet. They appear here the moment one is issued.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-2 pr-3 font-medium">Venue</th>
                  <th className="py-2 pr-3 font-medium">Period</th>
                  <th className="py-2 pr-3 font-medium">Number</th>
                  <th className="py-2 pr-3 font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Issued</th>
                  <th className="py-2 pr-3 font-medium">Paid</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id} className="border-t border-hero-blue/10">
                    <td className="py-2 pr-3 text-slate-300">
                      {venueById.get(i.venue_id)?.name ?? '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-slate-400">{i.period}</td>
                    <td className="py-2 pr-3 font-mono text-slate-400">
                      {i.oblio_series && i.oblio_number
                        ? `${i.oblio_series}${i.oblio_number}`
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{money(Number(i.amount))}</td>
                    <td className="py-2 pr-3 text-slate-500">{shortDate(i.issued_at)}</td>
                    <td className="py-2 pr-3">
                      {i.paid_at ? (
                        <span className="text-solana-green">✓ {shortDate(i.paid_at)}</span>
                      ) : (
                        <span className="text-hero-gold">unpaid</span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        {i.oblio_link && (
                          <a
                            href={i.oblio_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-hero-cyan/40 px-2 py-0.5 text-hero-cyan"
                          >
                            PDF ↗
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => togglePaid(i)}
                          disabled={busy === `paid:${i.id}`}
                          className="rounded-full border border-hero-blue/40 px-2 py-0.5 text-slate-300 transition hover:border-solana-green hover:text-solana-green disabled:opacity-40"
                        >
                          {i.paid_at ? 'Undo' : 'Mark paid'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
