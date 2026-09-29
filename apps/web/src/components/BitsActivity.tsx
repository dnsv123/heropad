import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '../lib/auth';

import { getJson } from '../services/apiClient';
import { useT, type TranslationKey } from '../i18n';
import Glyph from './Glyph';

// Profile → BITS. The balance, where it came from and where it went, the way
// a bank app shows an account: totals on top, a filter, the movements grouped
// by day, newest first, each one named (the venue, the reward), and a short
// "how to earn" underneath. Reads /api/user/bits, which is quick (no Helius).

export interface BitsEntry {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
  venue: string | null;
  item: string | null;
  tier: string | null;
  count: number | null;
  edition: number | null;
}
export interface BitsPage {
  ok: true;
  bits?: { current: number; earned: number; spent: number };
  entries: BitsEntry[];
  nextBefore: string | null;
}

type GlyphName = Parameters<typeof Glyph>[0]['name'];

const SPEND = new Set(['reward_claim', 'reward_expired']);

const REASON: Record<string, { title: TranslationKey; icon: GlyphName }> = {
  stamp: { title: 'bits.r.stamp', icon: 'stamp' },
  stamp_revoked: { title: 'bits.r.revoked', icon: 'x' },
  loyalty_trophy: { title: 'bits.r.card', icon: 'trophy' },
  loyalty_trophy_retro: { title: 'bits.r.card', icon: 'trophy' },
  passport_trophy: { title: 'bits.r.passport', icon: 'passport' },
  referral_inviter: { title: 'bits.r.inviter', icon: 'userPlus' },
  referral_friend: { title: 'bits.r.friend', icon: 'userPlus' },
  claim: { title: 'bits.r.claim', icon: 'sparkle' },
  reward_claim: { title: 'bits.r.reward', icon: 'gift' },
  reward_expired: { title: 'bits.r.refund', icon: 'clock' },
};

type Filter = 'all' | 'in' | 'out';

export default function BitsActivity() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { t, lang } = useT();
  const loc = lang === 'ro' ? 'ro-RO' : 'en-GB';
  const [totals, setTotals] = useState<BitsPage['bits'] | null>(null);
  const [entries, setEntries] = useState<BitsEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(
    async (before?: string) => {
      setBusy(true);
      setError(false);
      try {
        const token = await getAccessToken();
        if (!token) return;
        const qs = before ? `?before=${encodeURIComponent(before)}` : '';
        const r = await getJson<BitsPage>(`/api/user/bits${qs}`, token);
        if (r.bits) setTotals(r.bits);
        setEntries((prev) => (before && prev ? [...prev, ...r.entries] : r.entries));
        setNext(r.nextBefore);
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [getAccessToken]
  );

  useEffect(() => {
    if (ready && authenticated) void load();
  }, [ready, authenticated, load]);

  const num = (n: number) => n.toLocaleString(loc);

  const shown = useMemo(
    () =>
      (entries ?? []).filter((e) =>
        filter === 'all' ? true : filter === 'out' ? SPEND.has(e.reason) : !SPEND.has(e.reason)
      ),
    [entries, filter]
  );

  // Group by calendar day: Today, Yesterday, then the date.
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: BitsEntry[] }> = [];
    const today = new Date();
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const yesterday = new Date(today.getTime() - 86_400_000);
    for (const e of shown) {
      const d = new Date(e.createdAt);
      const label =
        dayKey(d) === dayKey(today)
          ? t('bits.today')
          : dayKey(d) === dayKey(yesterday)
            ? t('bits.yesterday')
            : d.toLocaleDateString(loc, {
                day: 'numeric',
                month: 'long',
                ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
              });
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [shown, loc, t]);

  const detail = (e: BitsEntry): string => {
    switch (e.reason) {
      case 'stamp':
        return [e.venue, e.count && e.count > 1 ? t('bits.d.stamps', { n: e.count }) : null].filter(Boolean).join(' · ');
      case 'stamp_revoked':
        return e.venue ?? '';
      case 'loyalty_trophy':
        return [e.venue, e.edition ? t('bits.d.trophy', { n: e.edition }) : null].filter(Boolean).join(' · ');
      case 'loyalty_trophy_retro':
        return [e.venue, t('bits.d.retro')].filter(Boolean).join(' · ');
      case 'passport_trophy':
        return e.tier ? t(`bits.tier.${e.tier}` as TranslationKey) : '';
      case 'referral_inviter':
        return t('bits.d.inviter');
      case 'referral_friend':
        return t('bits.d.friend');
      case 'claim':
        return t('bits.d.claim');
      case 'reward_claim':
        return e.item ?? '';
      case 'reward_expired':
        return e.item ? t('bits.d.refund', { item: e.item }) : t('bits.d.refund0');
      default:
        return '';
    }
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });

  const tab = (k: Filter, label: TranslationKey) => (
    <button
      key={k}
      type="button"
      role="tab"
      aria-selected={filter === k}
      onClick={() => setFilter(k)}
      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        filter === k ? 'bg-hero-navy2 text-white' : 'text-slate-400 hover:text-white'
      }`}
    >
      {t(label)}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* ---- Totals ---- */}
      <div
        className="rounded-[28px] border border-white/[0.08] p-5 sm:p-6"
        style={{ background: 'linear-gradient(160deg, #13306F 0%, #0B1F4D 60%, #0A1B3A 100%)' }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FFC45A]">{t('bits.balance')}</p>
        <p className="tnum mt-1 flex items-center gap-2 font-display text-5xl font-bold leading-none text-white">
          <Glyph name="bolt" className="h-8 w-8 text-[#F7A30C]" strokeWidth={2} />
          {totals ? num(totals.current) : <span className="inline-block h-10 w-28 animate-pulse rounded-lg bg-white/10" />}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/[0.05] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{t('bits.earned')}</p>
            <p className="tnum mt-0.5 font-display text-lg font-bold text-emerald-300">+{num(totals?.earned ?? 0)}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.05] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{t('bits.spent')}</p>
            <p className="tnum mt-0.5 font-display text-lg font-bold text-slate-200">−{num(totals?.spent ?? 0)}</p>
          </div>
        </div>
        <Link to="/rewards" className="btn btn-primary btn-sm mt-4 w-full justify-center gap-2">
          <Glyph name="gift" className="h-4 w-4" />
          {t('bits.shop')}
        </Link>
      </div>

      {/* ---- Activity ---- */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-white">{t('bits.activity')}</h2>
        </div>
        <div className="mt-3 flex gap-1 rounded-full border border-white/[0.08] bg-hero-navy p-1" role="tablist">
          {tab('all', 'bits.f.all')}
          {tab('in', 'bits.f.in')}
          {tab('out', 'bits.f.out')}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {t('bits.error')}{' '}
            <button type="button" onClick={() => void load()} className="underline underline-offset-2">
              {t('col.retry')}
            </button>
          </div>
        ) : entries === null ? (
          <div className="mt-4 space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-hero-navy" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-6 text-center">
            <p className="text-sm text-slate-300">{t(filter === 'out' ? 'bits.empty.out' : 'bits.empty')}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{g.label}</p>
                <ul className="mt-2 divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.07] bg-hero-navy/60">
                  {g.items.map((e) => {
                    const r = REASON[e.reason];
                    const plus = e.amount >= 0;
                    return (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                            SPEND.has(e.reason) && !plus ? 'bg-white/[0.06] text-slate-300' : 'bg-[#F7A30C]/[0.12] text-[#FFC45A]'
                          }`}
                        >
                          <Glyph name={r?.icon ?? 'bolt'} className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">
                            {r ? t(r.title) : t('bits.r.other')}
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {[detail(e), time(e.createdAt)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className={`tnum shrink-0 font-display text-base font-bold ${plus ? 'text-emerald-300' : 'text-slate-200'}`}>
                          {plus ? '+' : '−'}
                          {num(Math.abs(e.amount))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {next && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void load(next)}
                className="btn btn-secondary btn-sm w-full justify-center"
              >
                {busy ? '…' : t('bits.more')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- How to earn ---- */}
      <details className="group rounded-2xl border border-white/[0.08] bg-hero-navy p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
          {t('bits.how.title')}
          <Glyph name="arrow" className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
        </summary>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {(['bits.how.visit', 'bits.how.card', 'bits.how.friend', 'bits.how.passport'] as TranslationKey[]).map((k) => (
            <li key={k} className="flex gap-2">
              <Glyph name="bolt" className="mt-0.5 h-4 w-4 shrink-0 text-[#F7A30C]" />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">{t('bits.how.note')}</p>
      </details>
    </div>
  );
}
