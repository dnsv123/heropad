import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';

import { getJson, postJson, type ApiClientError } from '../services/apiClient';
import { useT } from '../i18n';

// /partner — the referral partner's dashboard.
// ---------------------------------------------------------------------------
// A partner introduces cafés and earns a share of what those cafés pay. The
// point of this page is trust: the commission is not a number we tell them each
// month, it is the same rows the invoice comes from, visible whenever they look.
//
// What is deliberately absent: any customer, any code, any other partner's
// venues, and the café's own statistics — those belong to the café, not to
// whoever introduced it.
//
// Access mirrors the merchant flow: log in with your own account, then type the
// one-time activation code once. Knowing the email is not enough to get in.

interface PartnerVenue {
  slug: string;
  name: string;
  city: string | null;
  billingStatus: string;
  monthlyFee: number;
  paidSince: string | null;
  claimed: boolean;
  createdAt: string;
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

interface PartnerData {
  ok: true;
  isPartner: boolean;
  partner?: {
    code: string;
    displayName: string;
    city: string | null;
    commissionPct: number;
    exclusiveCity: boolean;
    exclusiveUntil: string | null;
    active: boolean;
  };
  venues?: PartnerVenue[];
  totals?: {
    venuesTotal: number;
    venuesPaying: number;
    venuesTrial: number;
    monthlyCommission: number;
  };
  payouts?: Payout[];
}

const STATUS: Record<string, { ro: string; en: string; tone: string }> = {
  active: { ro: 'Plătește', en: 'Paying', tone: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  trial: { ro: 'Perioadă gratuită', en: 'Free period', tone: 'text-hero-gold border-hero-gold/30 bg-hero-gold/10' },
  paused: { ro: 'În pauză', en: 'Paused', tone: 'text-slate-400 border-slate-500/30 bg-slate-500/10' },
  cancelled: { ro: 'Încheiat', en: 'Ended', tone: 'text-red-400 border-red-500/30 bg-red-500/10' },
};

export default function Partner() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { t, lang } = useT();

  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [claiming, setClaiming] = useState(false);

  const money = (n: number) =>
    `${n.toLocaleString(lang === 'ro' ? 'ro-RO' : 'en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} ${lang === 'ro' ? 'lei' : 'RON'}`;

  const loadMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const at = await getAccessToken();
      const r = await getJson<PartnerData>('/api/partner/me', at ?? undefined);
      setData(r);
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (ready && authenticated) void loadMe();
  }, [ready, authenticated, loadMe]);

  async function claim() {
    const code = token.trim().toUpperCase();
    if (code.length < 4) return;
    setClaiming(true);
    setError(null);
    try {
      const at = await getAccessToken();
      const r = await postJson<{ token: string }, PartnerData>(
        '/api/partner/claim',
        { token: code },
        at ?? undefined
      );
      setData(r);
      setToken('');
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setClaiming(false);
    }
  }

  // ---- Not logged in -------------------------------------------------------
  if (!ready) {
    return (
      <section className="mx-auto max-w-2xl px-6 py-20 text-center text-slate-500">
        {t('pt.loading')}
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-bold">{t('pt.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{t('pt.login.hint')}</p>
        <button
          type="button"
          onClick={login}
          className="mt-6 w-full rounded-full bg-hero-gold px-6 py-3 font-semibold text-hero-deep transition hover:brightness-110"
        >
          {t('pt.login')}
        </button>
      </section>
    );
  }

  // ---- Logged in, not yet a partner → activation code ----------------------
  if (data && !data.isPartner) {
    return (
      <section className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl font-bold">{t('pt.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{t('pt.claim.hint')}</p>

        <div className="mt-6 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-5">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">
            {t('pt.claim.label')}
          </label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void claim();
            }}
            placeholder="XXXXXXXX"
            maxLength={12}
            className="mt-2 w-full rounded-xl border border-hero-blue/25 bg-hero-deep/70 px-4 py-3 text-center font-mono text-lg uppercase tracking-[0.3em] text-white"
          />
          <button
            type="button"
            onClick={() => void claim()}
            disabled={claiming || token.trim().length < 4}
            className="mt-3 w-full rounded-full bg-hero-gold px-6 py-3 font-semibold text-hero-deep transition hover:brightness-110 disabled:opacity-40"
          >
            {claiming ? t('pt.claim.busy') : t('pt.claim.go')}
          </button>
          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 w-full text-center text-xs text-slate-600 hover:text-slate-400"
        >
          {t('pt.logout')}
        </button>
      </section>
    );
  }

  // ---- Partner dashboard ---------------------------------------------------
  const p = data?.partner;
  const venues = data?.venues ?? [];
  const totals = data?.totals;

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-hero-cyan">{t('pt.eyebrow')}</p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
            {p?.displayName ?? '—'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('pt.code')}:{' '}
            <span className="font-mono tracking-widest text-hero-gold">{p?.code}</span>
            {p?.city && ` · ${p.city}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMe()}
          className="rounded-full border border-hero-blue/30 px-4 py-1.5 text-xs text-slate-400 transition hover:border-hero-cyan hover:text-white"
        >
          ↻ {t('pt.refresh')}
        </button>
      </div>

      {p?.exclusiveCity && (
        <p className="mt-4 rounded-xl border border-hero-gold/30 bg-hero-gold/10 px-4 py-2 text-xs text-hero-gold">
          ★ {t('pt.exclusive').replace('{city}', p.city ?? '—')}
          {p.exclusiveUntil && ` · ${t('pt.until')} ${p.exclusiveUntil}`}
        </p>
      )}

      {/* Headline numbers — commission first, it is why they opened the page */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { v: money(totals?.monthlyCommission ?? 0), l: t('pt.k.commission'), gold: true },
          { v: String(totals?.venuesPaying ?? 0), l: t('pt.k.paying') },
          { v: String(totals?.venuesTrial ?? 0), l: t('pt.k.trial') },
          { v: `${p?.commissionPct ?? 0}%`, l: t('pt.k.pct') },
        ].map((k) => (
          <div
            key={k.l}
            className={`rounded-2xl border p-4 text-center ${
              k.gold
                ? 'border-hero-gold/40 bg-hero-gold/10'
                : 'border-hero-blue/15 bg-hero-deep/60'
            }`}
          >
            <p
              className={`font-display text-xl font-bold ${
                k.gold ? 'text-hero-gold' : 'text-hero-cyan'
              }`}
            >
              {k.v}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{k.l}</p>
          </div>
        ))}
      </div>

      {/* Venue list */}
      <h2 className="mt-8 font-display text-lg font-semibold text-white">
        {t('pt.venues')}{' '}
        <span className="text-sm font-normal text-slate-500">({venues.length})</span>
      </h2>

      {loading && <p className="mt-3 text-sm text-slate-500">{t('pt.loading')}</p>}

      {!loading && venues.length === 0 && (
        <div className="mt-3 rounded-2xl border border-hero-blue/15 bg-hero-deep/60 px-4 py-10 text-center">
          <p className="text-sm text-slate-400">{t('pt.empty')}</p>
          <p className="mt-2 text-xs text-slate-600">{t('pt.empty.hint')}</p>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {venues.map((v, i) => {
          const s = STATUS[v.billingStatus] ?? STATUS.trial;
          return (
            <motion.li
              key={v.slug}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hero-blue/15 bg-hero-deep/60 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{v.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {v.city ? `${v.city} · ` : ''}
                  <span className={`rounded-full border px-2 py-0.5 ${s.tone}`}>
                    {lang === 'ro' ? s.ro : s.en}
                  </span>
                  {!v.claimed && ` · ${t('pt.notsetup')}`}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-display font-bold ${
                    v.commission > 0 ? 'text-hero-gold' : 'text-slate-600'
                  }`}
                >
                  {money(v.commission)}
                </p>
                <p className="text-[10px] text-slate-600">
                  {v.monthlyFee > 0 ? `${t('pt.of')} ${money(v.monthlyFee)}` : t('pt.nofee')}
                </p>
              </div>
            </motion.li>
          );
        })}
      </ul>

      {/* The ledger. The figure above is what this month is running at; these
          rows are closed months that no longer move. */}
      <h2 className="mt-8 font-display text-lg font-semibold text-white">{t('pt.payouts')}</h2>
      <p className="mt-1 text-xs text-slate-500">{t('pt.payouts.rule')}</p>

      {(data?.payouts ?? []).length === 0 ? (
        <p className="mt-3 rounded-2xl border border-hero-blue/15 bg-hero-deep/60 px-4 py-6 text-center text-xs text-slate-500">
          {t('pt.payouts.empty')}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {(data?.payouts ?? []).map((x) => (
            <li
              key={x.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hero-blue/15 bg-hero-deep/60 px-4 py-3"
            >
              <div>
                <p className="font-mono text-sm text-white">{x.period}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {x.venues} {x.venues === 1 ? t('pt.venue.one') : t('pt.venue.many')}
                  {x.note ? ` · ${x.note}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display font-bold text-hero-gold">{money(x.amount)}</p>
                <p className="text-[10px]">
                  {x.paidAt ? (
                    <span className="text-solana-green">
                      ✓ {t('pt.paid')} {x.paidAt.slice(0, 10)}
                    </span>
                  ) : (
                    <span className="text-hero-gold/80">{t('pt.owed')}</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-600">
        {t('pt.footer')}
      </p>

      <button
        type="button"
        onClick={() => void logout()}
        className="mt-4 w-full text-center text-xs text-slate-600 hover:text-slate-400"
      >
        {t('pt.logout')}
      </button>
    </section>
  );
}
