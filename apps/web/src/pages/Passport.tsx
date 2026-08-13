import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';

import { getJson } from '../services/apiClient';
import { explorerAddress, explorerTx } from '../lib/explorer';
import { useT, type TranslationKey } from '../i18n';

// /passport — the SuperVictor Passport: collect cafés, not just coffees.
// Layout follows the approved mockup (_private/MOCKUP_PASAPORT.html):
//   progress ring → tier strip (3/5/8, next one highlighted) → sticker-album
//   venue grid (visited stamped, unvisited as dashed silhouettes) → a concrete
//   next step. Deliberately NO geolocation: the suggestion names the venue and
//   its address instead of a distance, so the page asks for zero permissions.

interface PassportTier {
  threshold: number;
  key: 'bronze' | 'silver' | 'gold';
  earned: boolean;
  minted: boolean;
  assetId: string | null;
  mintTx: string | null;
  bits: number;
  awardedAt: string | null;
}

interface PassportVenue {
  slug: string;
  name: string;
  address: string | null;
  icon: string | null;
  stamps: number;
  visited: boolean;
}

interface PassportResponse {
  ok: true;
  visited: number;
  walletLinked: boolean;
  tiers: PassportTier[];
  venues: PassportVenue[];
}

const TIER_EMOJI: Record<PassportTier['key'], string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
};

function shortHash(h: string): string {
  return `${h.slice(0, 4)}…${h.slice(-4)}`;
}

export default function Passport() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { t } = useT();
  const [data, setData] = useState<PassportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await getJson<PassportResponse>('/api/loyalty/me/passport', token);
        if (active) setData(r);
      } catch (err) {
        if (active) setError((err as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authenticated, getAccessToken]);

  const nextTier = data?.tiers.find((x) => !x.earned) ?? null;
  const remaining = nextTier ? Math.max(0, nextTier.threshold - (data?.visited ?? 0)) : 0;
  const nextVenue = data?.venues.find((v) => !v.visited) ?? null;
  const mintedTrophies = data?.tiers.filter((x) => x.minted) ?? [];
  const pendingMint = data?.tiers.some((x) => x.earned && !x.minted) ?? false;

  // Ring geometry: r=36 → circumference ≈ 226. Fraction = visited / album size.
  const albumSize = Math.max(data?.venues.length ?? 0, 1);
  const CIRC = 2 * Math.PI * 36;
  const fraction = Math.min((data?.visited ?? 0) / albumSize, 1);

  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">
        🗺️ {t('pass.title')}
      </h1>
      <p className="mt-1 text-sm text-slate-400">{t('pass.sub')}</p>

      <div className="mt-8">
        {!ready ? (
          <p className="text-slate-400">Loading…</p>
        ) : !authenticated ? (
          <div className="space-y-4 rounded-2xl border border-slate-800 p-8 text-center">
            <p className="text-slate-300">{t('p.login.hint')}</p>
            <button
              type="button"
              onClick={login}
              className="rounded-full bg-[#9945FF] px-6 py-2.5 font-medium text-white transition hover:bg-[#7d34d6]"
            >
              {t('p.login.btn')}
            </button>
          </div>
        ) : error ? (
          <p className="text-sm text-slate-500">{t('pass.error')}</p>
        ) : !data ? (
          <p className="text-sm text-slate-500">{t('pass.loading')}</p>
        ) : (
          <div className="rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6">
            {/* ---- Progress ring ---- */}
            <div className="flex items-center gap-5">
              <svg width="86" height="86" viewBox="0 0 86 86" className="shrink-0">
                <circle
                  cx="43"
                  cy="43"
                  r="36"
                  fill="none"
                  stroke="rgba(93,211,255,.15)"
                  strokeWidth="9"
                />
                <circle
                  cx="43"
                  cy="43"
                  r="36"
                  fill="none"
                  stroke="url(#passport-ring)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - fraction)}
                  transform="rotate(-90 43 43)"
                />
                <defs>
                  <linearGradient id="passport-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#5DD3FF" />
                    <stop offset="100%" stopColor="#F5C842" />
                  </linearGradient>
                </defs>
                <text
                  x="43"
                  y="50"
                  textAnchor="middle"
                  fontSize="22"
                  fontWeight="800"
                  fill="#fff"
                >
                  {data.visited}
                </text>
              </svg>
              <div>
                <p className="font-display text-xl font-semibold text-white">
                  {t('pass.progress', { n: data.visited, m: data.venues.length })}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {nextTier
                    ? t('pass.next', {
                        k: remaining,
                        tier: t(`pass.tier.${nextTier.key}` as TranslationKey),
                      })
                    : t('pass.done.all')}
                </p>
              </div>
            </div>

            {/* ---- Tier strip: 🥉3 · 🥈5 · 🥇8, the next one highlighted ---- */}
            <div className="mt-5 flex gap-2">
              {data.tiers.map((tier) => {
                const isNext = nextTier?.threshold === tier.threshold;
                return (
                  <div
                    key={tier.key}
                    className={`flex-1 rounded-xl border px-2 py-2.5 text-center text-[11px] ${
                      tier.earned
                        ? 'border-hero-gold/50 bg-hero-gold/10 text-hero-gold'
                        : isNext
                          ? 'border-hero-cyan/40 bg-hero-deep/60 text-hero-cyan'
                          : 'border-hero-blue/15 bg-hero-deep/60 text-slate-500'
                    }`}
                  >
                    <span
                      className={`block text-xl leading-none ${tier.earned ? '' : 'opacity-40 grayscale'}`}
                    >
                      {TIER_EMOJI[tier.key]}
                    </span>
                    <span className="mt-1 block">
                      {t('pass.tier.n', { n: tier.threshold })}
                    </span>
                    {tier.earned ? (
                      <span className="block font-semibold">{t('pass.tier.got')}</span>
                    ) : isNext ? (
                      <span className="block">{t('pass.tier.next')}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-600">
              {t('pass.exclusive')}
            </p>

            {/* ---- Minted trophies (on-chain proof) ---- */}
            {mintedTrophies.length > 0 && (
              <div className="mt-5 space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('pass.trophies.title')}
                </h2>
                {mintedTrophies.map((tier) => (
                  <div
                    key={tier.key}
                    className="flex items-center justify-between rounded-xl border border-hero-gold/40 bg-hero-gold/5 px-4 py-2.5"
                  >
                    <span className="text-sm text-hero-gold">
                      {TIER_EMOJI[tier.key]} {t(`pass.tier.${tier.key}` as TranslationKey)}
                      {tier.bits > 0 && (
                        <span className="ml-2 text-[11px] text-solana-green">
                          +{tier.bits} BITS
                        </span>
                      )}
                    </span>
                    <span className="flex gap-2 text-[10px]">
                      {tier.mintTx && (
                        <a
                          href={explorerTx(tier.mintTx)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-hero-gold/40 px-2 py-0.5 text-hero-gold transition hover:bg-hero-gold/10"
                        >
                          Tx {shortHash(tier.mintTx)} ↗
                        </a>
                      )}
                      {tier.assetId && (
                        <a
                          href={explorerAddress(tier.assetId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-hero-cyan/40 px-2 py-0.5 text-hero-cyan transition hover:bg-hero-cyan/10"
                        >
                          Asset ↗
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {pendingMint && (
              <p className="mt-3 rounded-xl border border-hero-cyan/30 bg-hero-cyan/5 px-4 py-2.5 text-center text-xs text-hero-cyan">
                {t('pass.trophy.pending')}
              </p>
            )}

            {/* ---- The album: visited venues stamped, the rest silhouettes ---- */}
            <div className="mt-6 grid grid-cols-3 gap-2.5">
              {data.venues.map((v) => (
                <Link
                  key={v.slug}
                  to={`/loyalty/${v.slug}`}
                  className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl border p-2 text-center transition ${
                    v.visited
                      ? 'border-hero-gold/50 bg-hero-gold/5 hover:bg-hero-gold/10'
                      : 'border-dashed border-slate-600/40 bg-hero-deep/60 hover:border-hero-cyan/40'
                  }`}
                >
                  {v.visited && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 -rotate-12 items-center justify-center rounded-full bg-hero-gold text-[13px] font-black text-hero-deep shadow-hero-gold">
                      ✓
                    </span>
                  )}
                  <span
                    className={`text-3xl leading-none ${v.visited ? '' : 'opacity-40 grayscale'}`}
                  >
                    {v.icon ?? '☕'}
                  </span>
                  <span
                    className={`mt-1.5 text-[10px] leading-tight ${
                      v.visited ? 'text-hero-gold-bright' : 'text-slate-500'
                    }`}
                  >
                    {v.name}
                  </span>
                  {v.visited && (
                    <span className="absolute bottom-1.5 text-[9px] text-hero-gold/75">
                      {t('pass.visits', { n: v.stamps })}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            {data.visited === 0 && (
              <p className="mt-4 text-center text-sm text-slate-400">{t('pass.empty')}</p>
            )}

            {/* ---- Next step, concrete. Name + address — never a distance. ---- */}
            {nextTier && nextVenue && (
              <Link
                to={`/loyalty/${nextVenue.slug}`}
                className="mt-5 block rounded-xl border border-hero-cyan/30 bg-hero-cyan/5 px-4 py-3.5 text-center text-sm transition hover:bg-hero-cyan/10"
              >
                🎯{' '}
                <span className="font-semibold text-hero-cyan">
                  {t('pass.cta.title', { name: nextVenue.name })}
                </span>
                {nextVenue.address && (
                  <span className="mt-0.5 block text-xs text-slate-400">
                    📍 {nextVenue.address}
                  </span>
                )}
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {t('pass.cta.hint')}
                </span>
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
