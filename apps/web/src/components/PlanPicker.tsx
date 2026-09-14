import { useState } from 'react';

import {
  ADDONS,
  PLANS,
  monthlyTotal,
  planByKey,
  type AppliedAddon,
  type PlanKey,
} from '../lib/plans';

// Admin → venue card → the plan buttons.
//
// The scene this is built for: Valentin is standing at a counter, the owner
// just said "ok, Starter", and the venue needs to exist correctly before
// the owner picks up their phone. One tap sets fee, seats, plan and trial;
// the features list under the button is what gets read out loud.
//
// The fee is written as a NUMBER on the venue (plan base + recurring addons)
// because monthly_fee is the single source for invoices and partner
// commission. The plan + addon breakdown is stored alongside it so the
// number can always be explained later.

interface Props {
  currentPlan: string | null;
  currentAddons: AppliedAddon[];
  currentFee: number;
  onApply: (patch: {
    plan: PlanKey;
    addons: AppliedAddon[];
    monthlyFee: number;
    staffSeats: number;
    billingStatus?: 'trial' | 'active';
  }) => Promise<void> | void;
}

export default function PlanPicker({ currentPlan, currentAddons, currentFee, onApply }: Props) {
  const [open, setOpen] = useState<PlanKey | null>(null);
  const [addons, setAddons] = useState<AppliedAddon[]>(currentAddons);
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
        billingStatus: asTrial ? 'trial' : 'active',
      });
      setOpen(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-hero-gold/25 bg-hero-gold/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-hero-gold">Plan</p>
        <p className="text-[11px] text-slate-400">
          {current ? (
            <>
              <b className="text-white">{current.name}</b> · {currentFee} lei/lună
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

      <div className="mt-2 flex flex-wrap gap-2">
        {PLANS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setOpen(open === p.key ? null : p.key);
              setAddons(currentAddons);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              open === p.key
                ? 'border-hero-gold bg-hero-gold text-hero-deep'
                : current?.key === p.key
                ? 'border-solana-green/60 text-solana-green'
                : 'border-hero-blue/40 text-slate-200 hover:border-hero-gold hover:text-white'
            }`}
          >
            {p.name} · {p.price}
          </button>
        ))}
      </div>

      {preview && (
        <div className="mt-3 space-y-3 rounded-lg border border-hero-blue/20 bg-hero-deep/70 p-3">
          <div>
            <p className="font-display text-sm font-semibold text-white">
              {preview.name} — {preview.tagline}
            </p>
            <p className="text-[11px] text-slate-500">
              {preview.price} lei/lună · {preview.seats} conturi de angajat ·{' '}
              {preview.trialDays > 0 ? `${preview.trialDays} zile gratuit` : 'fără perioadă gratuită'}
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-solana-green">Ce primește</p>
            <ul className="mt-1 space-y-0.5 text-[12px] text-slate-300">
              {preview.features.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-hero-cyan">Ce pregătești tu</p>
            <ol className="mt-1 space-y-0.5 text-[12px] text-slate-400">
              {preview.prepare.map((s, i) => (
                <li key={s}>
                  <span className="text-hero-gold">{i + 1}.</span> {s}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Extra-opțiuni</p>
            <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
              {ADDONS.map((a) => {
                const qty = addons.find((x) => x.key === a.key)?.qty ?? 0;
                return (
                  <div
                    key={a.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-hero-blue/15 px-2.5 py-1.5"
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
                        className="h-6 w-6 rounded-full border border-hero-blue/30 text-slate-300"
                      >
                        −
                      </button>
                      <span className="w-4 text-center font-mono text-xs text-white">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(a.key, qty + 1)}
                        className="h-6 w-6 rounded-full border border-hero-blue/30 text-slate-300"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hero-blue/15 pt-3">
            <p className="text-sm">
              <span className="text-slate-500">Total lunar: </span>
              <b className="font-display text-lg text-hero-gold">
                {monthlyTotal(preview, addons)} lei
              </b>
              {addons.some((a) => a.once) && (
                <span className="ml-2 text-[11px] text-slate-500">
                  + {addons.filter((a) => a.once).reduce((s, a) => s + a.price * a.qty, 0)} lei o dată
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply(true)}
                className="rounded-full border border-hero-gold/60 px-4 py-1.5 text-xs font-semibold text-hero-gold hover:bg-hero-gold/10 disabled:opacity-50"
              >
                {busy ? '…' : `Aplică — pilot gratuit ${preview.trialDays} zile`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply(false)}
                className="rounded-full bg-hero-gold px-4 py-1.5 text-xs font-semibold text-hero-deep hover:bg-hero-gold-bright disabled:opacity-50"
              >
                {busy ? '…' : 'Aplică — plătește de acum'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
