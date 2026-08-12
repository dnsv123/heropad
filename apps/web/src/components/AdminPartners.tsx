import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

import { getJson, postJson, type ApiClientError } from '../services/apiClient';

// Admin → Partners. Everything the monthly payout run needs, on one screen:
// who brought which venues, which of those are actually paying, and the sum
// owed to each partner.
//
// Commission is derived from the venue's own fee and billing status rather than
// typed in here, so the number a partner sees on their page and the number in
// this list cannot drift apart — which is the only reason a partner has to
// trust either of them.

interface PartnerVenue {
  slug: string;
  name: string;
  city: string | null;
  billingStatus: string;
  monthlyFee: number;
  claimed: boolean;
  commission: number;
}

interface Payout {
  id: string;
  period: string;
  amount: number;
  venues: number;
  paidAt: string | null;
  note: string | null;
}

interface PartnerRow {
  id: string;
  email: string | null;
  claimed: boolean;
  claimToken: string | null;
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
  payouts: Payout[];
}

const money = (n: number) => `${n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`;

export default function AdminPartners({
  onNotice,
  onPartners,
}: {
  onNotice: (kind: 'ok' | 'err', text: string) => void;
  /** Feeds the venue picker, so a referral code is chosen rather than typed. */
  onPartners?: (list: Array<{ code: string; name: string }>) => void;
}) {
  const { getAccessToken } = usePrivy();
  // The parent passes these as inline arrows, so they are new objects on every
  // render. Depending on them made `load` change identity every render, the
  // effect refire, and the fetch loop never stop - which is why the panel felt
  // slow and why every button stayed disabled behind a `busy` that never
  // cleared. Refs keep the latest callback without entering the dependency.
  const noticeRef = useRef(onNotice);
  const partnersRef = useRef(onPartners);
  noticeRef.current = onNotice;
  partnersRef.current = onPartners;
  const [partners, setPartners] = useState<PartnerRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // create form
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [pct, setPct] = useState('25');
  const [exclusive, setExclusive] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const at = await getAccessToken();
      const r = await getJson<{ ok: true; partners: PartnerRow[] }>(
        '/api/admin/partners',
        at ?? undefined
      );
      setPartners(r.partners);
      partnersRef.current?.(
        r.partners
          .filter((p) => p.partner.active)
          .map((p) => ({ code: p.partner.code, name: p.partner.displayName }))
      );
    } catch (err) {
      noticeRef.current('err', (err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPartner() {
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      const at = await getAccessToken();
      const r = await postJson<Record<string, unknown>, { ok: true; code: string; activationCode: string }>(
        '/api/admin/partners',
        {
          displayName: name.trim(),
          city: city.trim() || undefined,
          email: email.trim() || undefined,
          commissionPct: Number(pct) || 25,
          exclusiveCity: exclusive,
        },
        at ?? undefined
      );
      onNotice(
        'ok',
        `Partner ${r.code} created. Activation code: ${r.activationCode} — send it with the link /partner`
      );
      setName('');
      setCity('');
      setEmail('');
      setCreating(false);
      await load();
    } catch (err) {
      onNotice('err', (err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetCode(code: string) {
    setBusy(true);
    try {
      const at = await getAccessToken();
      const r = await postJson<Record<string, never>, { ok: true; activationCode: string }>(
        `/api/admin/partners/${code}/reset-code`,
        {},
        at ?? undefined
      );
      onNotice('ok', `New activation code for ${code}: ${r.activationCode}`);
      await load();
    } catch (err) {
      onNotice('err', (err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  /** The month that just closed - what you settle on the 10th. */
  function lastPeriod(): string {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async function recordPayout(p: PartnerRow, period: string, amount: number, paid: boolean) {
    setBusy(true);
    try {
      const at = await getAccessToken();
      await postJson(
        `/api/admin/partners/${p.partner.code}/payouts`,
        { period, amount, venues: p.totals.venuesPaying, paid },
        at ?? undefined
      );
      await load();
      onNotice('ok', `${p.partner.code}: ${period} recorded (${money(amount)}).`);
    } catch (err) {
      onNotice('err', (err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePaid(p: PartnerRow, payout: Payout) {
    setBusy(true);
    try {
      const at = await getAccessToken();
      await postJson(
        `/api/admin/partners/${p.partner.code}/payouts/${payout.id}/paid`,
        { paid: !payout.paidAt },
        at ?? undefined
      );
      await load();
    } catch (err) {
      onNotice('err', (err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(code: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const at = await getAccessToken();
      await postJson(`/api/admin/partners/${code}`, body, at ?? undefined);
      await load();
      onNotice('ok', `Saved ${code}.`);
    } catch (err) {
      onNotice('err', (err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  const payoutTotal = (partners ?? []).reduce((s, p) => s + p.totals.monthlyCommission, 0);

  return (
    <div className="mt-8 rounded-2xl border border-hero-gold/30 bg-hero-deep/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-hero-gold">🤝 Partners</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-hero-gold/30 bg-hero-gold/10 px-3 py-1 text-xs text-hero-gold">
            Payout this month: <strong>{money(payoutTotal)}</strong>
          </span>
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="rounded-full bg-hero-gold px-3 py-1 text-xs font-semibold text-hero-deep transition hover:brightness-110"
          >
            {creating ? 'Cancel' : '+ New partner'}
          </button>
        </div>
      </div>

      {creating && (
        <div className="mt-4 grid gap-2 rounded-xl border border-hero-blue/20 bg-hero-deep/70 p-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Andrei Pop)"
            className="rounded-lg border border-hero-blue/25 bg-hero-deep px-3 py-2 text-sm text-white"
          />
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (e.g. Sibiu)"
            className="rounded-lg border border-hero-blue/25 bg-hero-deep px-3 py-2 text-sm text-white"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (contact only)"
            className="rounded-lg border border-hero-blue/25 bg-hero-deep px-3 py-2 text-sm text-white"
          />
          <div className="flex items-center gap-2">
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              type="number"
              min={0}
              max={100}
              className="w-20 rounded-lg border border-hero-blue/25 bg-hero-deep px-3 py-2 text-sm text-white"
            />
            <span className="text-xs text-slate-500">% commission</span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={exclusive}
                onChange={(e) => setExclusive(e.target.checked)}
              />
              City exclusive
            </label>
          </div>
          <button
            type="button"
            onClick={() => void createPartner()}
            disabled={busy || name.trim().length < 2}
            className="rounded-full bg-hero-gold px-4 py-2 text-sm font-semibold text-hero-deep disabled:opacity-40 sm:col-span-2"
          >
            Create partner + activation code
          </button>
        </div>
      )}

      {partners === null && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {partners?.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          No partners yet. Create one, then send them the activation code and the /partner link.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {(partners ?? []).map((p) => {
          const isOpen = openCode === p.partner.code;
          return (
            <div
              key={p.id}
              className="overflow-hidden rounded-xl border border-hero-blue/20 bg-hero-deep/70"
            >
              <button
                type="button"
                onClick={() => setOpenCode(isOpen ? null : p.partner.code)}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-hero-blue/5"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    {p.partner.displayName}{' '}
                    <span
                      title="Referral code — pick this in a venue's Brought by"
                      className="font-mono text-xs tracking-widest text-hero-gold"
                    >
                      {p.partner.code}
                    </span>
                    {!p.partner.active && (
                      <span className="ml-2 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300">
                        inactive
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {p.partner.city ?? '—'} · {p.partner.commissionPct}% ·{' '}
                    {p.totals.venuesPaying}/{p.totals.venuesTotal} paying
                    {p.partner.exclusiveCity && ' · ★ exclusive'}
                    {!p.claimed && ' · ⚠ account not activated'}
                  </p>
                </div>
                <p className="font-display font-bold text-hero-gold">
                  {money(p.totals.monthlyCommission)}
                </p>
              </button>

              {isOpen && (
                <div className="border-t border-hero-blue/15 px-4 py-3">
                  {/* Activation state — the thing that blocks a new partner */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {p.claimed ? (
                      <span className="rounded-full border border-solana-green/30 bg-solana-green/10 px-2 py-0.5 text-solana-green">
                        ✓ account activated
                      </span>
                    ) : p.claimToken ? (
                      <span className="rounded-full border border-hero-gold/30 bg-hero-gold/10 px-2 py-0.5 text-hero-gold">
                        one-time login code (send with /partner):{' '}
                        <strong className="font-mono tracking-widest">{p.claimToken}</strong>
                      </span>
                    ) : (
                      <span className="text-slate-500">no code — reset to issue one</span>
                    )}
                    <button
                      type="button"
                      onClick={() => void resetCode(p.partner.code)}
                      className="rounded-full border border-hero-blue/30 px-2.5 py-0.5 text-slate-400 transition hover:border-hero-cyan hover:text-white"
                    >
                      ↻ new code
                    </button>
                    <button
                      type="button"
                      onClick={() => void patch(p.partner.code, { active: !p.partner.active })}
                      className="rounded-full border border-hero-blue/30 px-2.5 py-0.5 text-slate-400 transition hover:border-hero-cyan hover:text-white"
                    >
                      {p.partner.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {p.email && <span className="text-slate-600">{p.email}</span>}
                  </div>

                  {/* Terms */}
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500">
                      Commission %
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={p.partner.commissionPct}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== p.partner.commissionPct) {
                            void patch(p.partner.code, { commissionPct: v });
                          }
                        }}
                        className="mt-1 block w-24 rounded-lg border border-hero-blue/25 bg-hero-deep px-2 py-1 text-sm text-white"
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-wider text-slate-500">
                      Exclusive until
                      <input
                        type="date"
                        defaultValue={p.partner.exclusiveUntil ?? ''}
                        onBlur={(e) =>
                          void patch(p.partner.code, {
                            exclusiveUntil: e.target.value || null,
                            exclusiveCity: Boolean(e.target.value),
                          })
                        }
                        className="mt-1 block rounded-lg border border-hero-blue/25 bg-hero-deep px-2 py-1 text-sm text-white"
                      />
                    </label>
                  </div>

                  {/* Their venues */}
                  <table className="mt-3 w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-1">Venue</th>
                        <th className="py-1">Status</th>
                        <th className="py-1">Fee</th>
                        <th className="py-1">Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.venues.map((v) => (
                        <tr key={v.slug} className="border-t border-hero-blue/10">
                          <td className="py-1.5 text-slate-300">
                            {v.name}
                            {!v.claimed && (
                              <span className="ml-1 text-[10px] text-hero-gold">· not set up</span>
                            )}
                          </td>
                          <td className="py-1.5 text-slate-400">{v.billingStatus}</td>
                          <td className="py-1.5 text-slate-400">{money(v.monthlyFee)}</td>
                          <td className="py-1.5 font-semibold text-hero-gold">
                            {money(v.commission)}
                          </td>
                        </tr>
                      ))}
                      {p.venues.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-3 text-slate-600">
                            No venues attributed yet — set “Brought by” on a venue above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Payout ledger. The live figure above moves with today's
                      billing status; these rows are what was actually earned,
                      and they stop moving once written. */}
                  <div className="mt-4 rounded-xl border border-hero-blue/15 bg-hero-deep/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wider text-slate-500">
                        Payout ledger
                      </p>
                      {!p.payouts.some((x) => x.period === lastPeriod()) &&
                        p.totals.monthlyCommission > 0 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void recordPayout(
                                p,
                                lastPeriod(),
                                p.totals.monthlyCommission,
                                false
                              )
                            }
                            className="rounded-full bg-hero-gold px-3 py-1 text-[11px] font-semibold text-hero-deep disabled:opacity-40"
                          >
                            Close {lastPeriod()} → {money(p.totals.monthlyCommission)}
                          </button>
                        )}
                    </div>

                    {p.payouts.length === 0 ? (
                      <p className="mt-2 text-[11px] text-slate-600">
                        Nothing recorded yet. Close a month here, pay by bank transfer, then
                        tick it — the partner sees the same rows.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {p.payouts.map((x) => (
                          <li
                            key={x.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-hero-deep/60 px-3 py-2 text-xs"
                          >
                            <span className="text-slate-300">
                              <b className="font-mono">{x.period}</b>
                              <span className="ml-2 text-slate-500">
                                {x.venues} venue{x.venues === 1 ? '' : 's'}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-semibold text-hero-gold">
                                {money(x.amount)}
                              </span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void togglePaid(p, x)}
                                className={`rounded-full border px-2.5 py-0.5 text-[10px] transition disabled:opacity-40 ${
                                  x.paidAt
                                    ? 'border-solana-green/40 bg-solana-green/10 text-solana-green'
                                    : 'border-hero-gold/40 text-hero-gold hover:bg-hero-gold hover:text-hero-deep'
                                }`}
                              >
                                {x.paidAt
                                  ? `✓ paid ${x.paidAt.slice(0, 10)}`
                                  : 'Mark paid'}
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-slate-600">
        Two different codes, on purpose: the <strong>referral code</strong> (e.g. SI-VALENTIN)
        is what you pick under a venue's “Brought by”, and the <strong>one-time login
        code</strong> is what the partner types once at /partner to claim their account.
        Commission counts only venues with billing status <strong>active</strong>.
      </p>
    </div>
  );
}
