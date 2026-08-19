import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
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

/** The commissioned medal art (WebP for UI; the cNFT metadata points at the
 * full-res PNGs, same split as the venue trophy). */
const TIER_ART: Record<PassportTier['key'], string> = {
  bronze: '/loyalty/passport/bronze_round_medal.webp',
  silver: '/loyalty/passport/silver_round_medal.webp',
  gold: '/loyalty/passport/gold_round_medal.webp',
};

function shortHash(h: string): string {
  return `${h.slice(0, 4)}…${h.slice(-4)}`;
}

export default function Passport() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { t } = useT();
  // One-shot decorative animations only; a visitor who asked their OS for less
  // motion gets the stamps already settled.
  const reduceMotion = useReducedMotion();
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
          /* The booklet. All texture below is CSS gradients on single
             elements — no images, no extra requests, one paint each. */
          <div className="overflow-hidden rounded-[22px] border-2 border-hero-gold/40 bg-gradient-to-b from-[#0d2148] to-hero-deep shadow-2xl">
            {/* Cover strip: the part of a passport you recognise from a metre away. */}
            <div className="relative border-b border-hero-gold/30 bg-gradient-to-r from-hero-deep via-[#102a5c] to-hero-deep px-6 py-4 text-center">
              <p className="text-[9px] uppercase tracking-[0.35em] text-hero-cyan/70">
                SuperVictor Universe
              </p>
              <p className="mt-0.5 font-display text-lg font-bold uppercase tracking-[0.3em] text-hero-gold">
                {t('pass.booklet')}
              </p>
              {/* Emblem — the SuperVictor silhouette as gold foil. The PNG is
                 a 4 KB alpha mask; the colour comes from CSS, so switching
                 gold ↔ white is a one-class change. */}
              <span
                aria-hidden
                className="mx-auto mt-1.5 block h-10 w-10 bg-hero-gold/90"
                style={{
                  WebkitMaskImage: 'url(/passport-emblem.png)',
                  maskImage: 'url(/passport-emblem.png)',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                }}
              />
              <p className="mt-1 font-mono text-[9px] tracking-[0.2em] text-slate-500">
                TIP/TYPE P · COD/CODE SVU
              </p>
            </div>

            {/* Open page: binding stitch on the left, faint guilloche waves
               like the real thing — a single repeating gradient at 4% opacity. */}
            <div className="relative p-6">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                style={{
                  backgroundImage:
                    'repeating-radial-gradient(circle at 50% 130%, #5DD3FF 0, #5DD3FF 1px, transparent 1px, transparent 9px)',
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-2 left-3 top-2 border-l-2 border-dashed border-hero-gold/20"
              />
              <div className="relative">
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
                    <img
                      src={TIER_ART[tier.key]}
                      alt=""
                      className={`mx-auto block h-9 w-9 object-contain ${tier.earned ? '' : 'opacity-40 grayscale'}`}
                    />
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
                    <span className="flex items-center gap-2 text-sm text-hero-gold">
                      <img
                        src={TIER_ART[tier.key]}
                        alt=""
                        className="h-9 w-9 object-contain"
                      />
                      {t(`pass.tier.${tier.key}` as TranslationKey)}
                      {tier.bits > 0 && (
                        <span className="ml-1 text-[11px] text-solana-green">
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
              {data.venues.map((v, i) => (
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
                    /* Rubber-stamp seal, thumped into the page. One-shot
                       spring on transform/opacity only — GPU-composited,
                       nothing animates after settle. */
                    <motion.span
                      initial={
                        reduceMotion ? false : { scale: 2, opacity: 0, rotate: 10 }
                      }
                      animate={{ scale: 1, opacity: 1, rotate: -12 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 26,
                        delay: Math.min(i * 0.07, 0.6),
                      }}
                      className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-hero-gold/80 text-[12px] font-black text-hero-gold"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-[3px] rounded-full border border-dashed border-hero-gold/50"
                      />
                      ✓
                    </motion.span>
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
            </div>

            {/* Machine-readable zone — the two OCR lines every passport ends
               with. Pure flavour, pure CSS. */}
            <div
              aria-hidden
              className="select-none border-t border-hero-gold/20 bg-hero-deep/80 px-6 py-2.5 font-mono text-[10px] leading-relaxed tracking-[0.18em] text-slate-600"
            >
              <p className="truncate">P&lt;SVUHEROPAD&lt;&lt;SUPERVICTOR&lt;PASSPORT&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p>
              <p className="truncate">
                {String(data.visited).padStart(2, '0')}OF
                {String(data.venues.length).padStart(2, '0')}
                &lt;&lt;VENUES&lt;COLLECTED&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
