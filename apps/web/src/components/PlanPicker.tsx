import { useState } from 'react';

import {
  ADDONS,
  PLANS,
  annualPrice,
  monthlyTotal,
  planByKey,
  type AppliedAddon,
  type BillingPeriod,
  type PlanKey,
} from '../lib/plans';

// Admin → venue card → the plan buttons.
//
// The scene this is built for: Valentin is standing at a counter, the owner
// just said "ok, Branded, anual", and the venue needs to exist correctly
// before the owner picks up their phone. One tap sets fee, seats, plan,
// billing period and trial; the features list under the button is what gets
// read out loud.
//
// The fee is written as a NUMBER on the venue (plan base + recurring addons)
// because monthly_fee is the single source for invoices and partner
// commission. Annual does not change the fee — it changes how it is
// invoiced: one invoice of ten fees a year instead of twelve of one.

interface Props {
  currentPlan: string | null;
  currentAddons: AppliedAddon[];
  currentFee: number;
  currentPeriod: BillingPeriod;
  onApply: (patch: {
    plan: PlanKey;
    addons: AppliedAddon[];
    monthlyFee: number;
    staffSeats: number;
    billingPeriod: BillingPeriod;
    billingStatus?: 'trial' | 'active';
  }) => Promise<void> | void;
}

export default function PlanPicker({
  currentPlan,
  currentAddons,
  currentFee,
  currentPeriod,
  onApply,
}: Props) {
  const [open, setOpen] = useState<PlanKey | null>(null);
  const [addons, setAddons] = useState<AppliedAddon[]>(currentAddons);
  const [period, setPeriod] = useState<BillingPeriod>(currentPeriod);
  const [busy, setBusy] = useState(false);

  const current = planByKey(currentPlan);
  const preview = open ? planByKey(open) : null;

  const setQty = (key: string, qty: number) => {
    const def = ADDONS.find((a) => a.key === key);
    if (!def) return;
    setAddons((prev) => {
      const rest = prev.filter((a) => a.key !== key);
      return qty > 0
        ? [...rest, { key, label: def.label, price: def.price, qty, once: def.once }]
        : rest;
    });
  };

  const apply = async (asTrial: boolean) => {
    if (!preview) return;
    setBusy(true);
    try {
      const extraSeats = addons.find((a) => a.key === 'extra_seat')?.qty ?? 0;
      await onApply({
        plan: preview.key,
        addons,
        monthlyFee: monthlyTotal(preview, addons),
        staffSeats: preview.seats + extraSeats,
        billingPeriod: period,
        billingStatus: asTrial ? 'trial' : 'active',
      });
      setOpen(null);
    } finally {
      setBusy(false);
    }
  };

  const monthly = preview ? monthlyTotal(preview, addons) : 0;
  const onceTotal = addons.filter((a) => a.once).reduce((s, a) => s + a.price * a.qty, 0);

  return (
    <div className="card-sm mt-3 border-hero-gold/25 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-hero-gold">Plan</p>
        <p className="text-[11px] text-slate-400">
          {current ? (
            <>
              <b className="text-white">{current.name}</b> · {currentFee} lei/lună
              {currentPeriod === 'annual' && (
                <span className="text-hero-gold"> · facturat anual ({annualPrice(currentFee)} lei/an)</span>
              )}
              {currentAddons.length > 0 && (
                <span className="text-slate-500">
                  {' '}
                  · +{currentAddons.map((a) => `${a.qty}× ${a.label}`).join(', ')}
                </span>
              )}
            </>
          ) : (
            <span className="text-hero-gold">neconfigurat — alege un plan</span>
          )}
        </p>
      </div>

      {/* The four public plans plus Founding: one row of pills. The one in
          force is outlined; the one being looked at is filled. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {PLANS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setOpen(open === p.key ? null : p.key);
              setAddons(currentAddons);
              setPeriod(currentPeriod);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              open === p.key
                ? 'border-hero-gold bg-hero-gold text-hero-deep'
                : current?.key === p.key
                ? 'border-hero-gold/60 text-hero-gold'
                : 'border-white/15 text-slate-200 hover:border-white/30 hover:text-white'
            }`}
          >
            {p.name} · {p.price}
          </button>
        ))}
      </div>

      {preview && (
        <div className="card mt-3 space-y-4 p-4">
          {/* Header: name, tagline, and the two numbers that matter. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-base font-semibold text-white">{preview.name}</p>
              <p className="text-[12px] text-slate-400">{preview.tagline}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {preview.seats} conturi de angajat ·{' '}
                {preview.trialDays > 0 ? `pilot gratuit ${preview.trialDays} zile` : 'fără pilot'}
              </p>
            </div>
            {/* Monthly / annual — the segmented control the landing page also
                has, so the owner sees the same two choices in both places. */}
            <div className="flex rounded-full border border-white/10 bg-hero-deep p-1 text-[11px] font-semibold">
              {(['monthly', 'annual'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPeriod(k)}
                  className={`rounded-full px-3 py-1.5 transition ${
                    period === k ? 'bg-hero-gold text-hero-deep' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {k === 'monthly' ? 'Lunar' : 'Anual · 2 luni gratis'}
                </button>
              ))}
            </div>
          </div>

          {/* What the café gets — one line each, a gold tick, read out loud. */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-hero-gold">Ce primește</p>
            <ul className="mt-1.5 space-y-1">
              {preview.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[12px] leading-snug text-slate-200">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-hero-gold" aria-hidden>
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-hero-cyan">Ce pregătești tu</p>
            <ol className="mt-1.5 space-y-1 text-[12px] leading-snug text-slate-400">
              {preview.prepare.map((s, i) => (
                <li key={s} className="flex gap-2">
                  <span className="tnum w-4 shrink-0 text-hero-gold">{i + 1}.</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Extra-opțiuni</p>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {ADDONS.map((a) => {
                const qty = addons.find((x) => x.key === a.key)?.qty ?? 0;
                return (
                  <div
                    key={a.key}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 ${
                      qty > 0 ? 'border-hero-gold/40 bg-hero-gold/5' : 'border-white/[0.08]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] text-slate-200">{a.label}</p>
                      <p className="text-[10px] text-slate-500">
                        {a.price} lei{a.once ? ' o dată' : '/lună'} · {a.hint}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(a.key, Math.max(0, qty - 1))}
                        className="h-6 w-6 rounded-full border border-white/15 text-slate-300"
                      >
                        −
                      </button>
                      <span className="tnum w-4 text-center font-mono text-xs text-white">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(a.key, qty + 1)}
                        className="h-6 w-6 rounded-full border border-white/15 text-slate-300"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* The total, the way it will be invoiced. */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-white/[0.08] pt-3">
            <div>
              {period === 'annual' ? (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">O factură pe an</p>
                  <p className="tnum font-display text-2xl font-bold leading-none text-hero-gold">
                    {annualPrice(monthly)} lei
                    <span className="ml-1.5 text-xs font-normal text-slate-500">
                      = 10 × {monthly} · echivalent {Math.round((annualPrice(monthly) / 12) * 10) / 10} lei/lună
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Total lunar</p>
                  <p className="tnum font-display text-2xl font-bold leading-none text-hero-gold">
                    {monthly} lei
                  </p>
                </>
              )}
              {onceTotal > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">+ {onceTotal} lei o singură dată</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply(true)}
                className="btn btn-ghost btn-sm"
              >
                {busy ? '…' : `Aplică — pilot gratuit ${preview.trialDays} zile`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply(false)}
                className="btn btn-primary btn-sm"
              >
                {busy ? '…' : 'Aplică — plătește de acum'}
              </button>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            <b className="text-slate-400">Ce face „Aplică":</b> scrie prețul lunar, conturile de
            angajat, planul și felul de facturare pe local; „plătește de acum" pune billing pe{' '}
            <i>active</i> cu data de azi (de aici curge comisionul partenerului).{' '}
            <b className="text-slate-400">Nu emite nicio factură</b> — factura pleacă din tab-ul
            Billing, după ce completezi datele de firmă ale localului: lunar în ziua lui de
            facturare, sau anual, o singură dată, în luna în care a devenit activ.
          </p>
        </div>
      )}
    </div>
  );
}
