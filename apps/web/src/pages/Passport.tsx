import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import { getJson } from '../services/apiClient';
import { explorerAddress } from '../lib/explorer';
import { useT, type TranslationKey } from '../i18n';
import Glyph from '../components/Glyph';

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
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-16">
        <h1 className="text-balance font-display text-3xl font-bold leading-tight text-white md:text-4xl">
          {t('pass.title')}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">{t('pass.sub')}</p>

        <div className="mt-8">
          {!ready ? (
            <div className="h-96 animate-pulse rounded-[28px] border border-white/[0.06] bg-hero-navy/60" />
          ) : !authenticated ? (
            <div className="flex flex-col items-center gap-4 rounded-[28px] border border-white/[0.08] bg-hero-navy px-6 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[#F7A30C]/15 text-[#FFC45A]">
                <Glyph name="passport" className="h-7 w-7" />
              </span>
              <p className="max-w-xs text-sm text-slate-300">{t('p.login.hint')}</p>
              <button
                type="button"
                onClick={login}
                className="rounded-full bg-[#F7A30C] px-6 py-2.5 text-sm font-semibold text-hero-deep transition hover:bg-[#FFB42A]"
              >
                {t('p.login.btn')}
              </button>
            </div>
          ) : error ? (
            <p className="rounded-2xl border border-white/[0.08] bg-hero-navy px-4 py-6 text-center text-sm text-slate-400">
              {t('pass.error')}
            </p>
          ) : !data ? (
            <div className="h-96 animate-pulse rounded-[28px] border border-white/[0.06] bg-hero-navy/60" />
          ) : (
            /* The booklet. All texture below is CSS gradients on single
               elements: no images, no extra requests, one paint each. */
            <div
              className="overflow-hidden rounded-[28px] shadow-[0_40px_80px_-40px_rgba(3,10,35,0.9)] ring-1 ring-[#F7A30C]/35"
              style={{ background: 'linear-gradient(180deg, #0D2A6B 0%, #0A2766 30%, #061A47 100%)' }}
            >
              {/* Cover strip: the part of a passport you recognise from a metre away. */}
              <div
                className="relative border-b border-[#F7A30C]/25 px-6 py-5 text-center"
                style={{
                  background:
                    'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px), linear-gradient(90deg, #061A47, #14357F 50%, #061A47)',
                }}
              >
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-white/50">SuperVictor Universe</p>
                <p className="mt-1 font-display text-lg font-bold uppercase tracking-[0.3em] text-[#F7A30C]">
                  {t('pass.booklet')}
                </p>
                {/* Emblem: the SuperVictor silhouette as foil. The PNG is a
                   4 KB alpha mask; the colour comes from CSS. */}
                <span
                  aria-hidden
                  className="mx-auto mt-2 block h-10 w-10 bg-[#F7A30C]"
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
                <p className="mt-1.5 font-mono text-[9px] tracking-[0.2em] text-white/40">TIP/TYPE P · COD/CODE SVU</p>
              </div>

              {/* Open page: binding stitch on the left, faint guilloche waves. */}
              <div className="relative p-5 sm:p-7">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.06]"
                  style={{
                    backgroundImage:
                      'repeating-radial-gradient(circle at 50% 130%, #F7A30C 0, #F7A30C 1px, transparent 1px, transparent 9px)',
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute bottom-3 left-3 top-3 border-l-2 border-dashed border-[#F7A30C]/20"
                />
                <div className="relative pl-2">
                  {/* ---- Progress ring ---- */}
                  <div className="flex items-center gap-5">
                    <svg width="92" height="92" viewBox="0 0 86 86" className="shrink-0" role="img" aria-label={t('pass.progress', { n: data.visited, m: data.venues.length })}>
                      <circle cx="43" cy="43" r="36" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="8" />
                      <circle
                        cx="43"
                        cy="43"
                        r="36"
                        fill="none"
                        stroke="#F7A30C"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={CIRC}
                        strokeDashoffset={CIRC * (1 - fraction)}
                        transform="rotate(-90 43 43)"
                      />
                      <text x="43" y="50" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff">
                        {data.visited}
                      </text>
                    </svg>
                    <div className="min-w-0">
                      <p className="font-display text-xl font-bold text-white">
                        {t('pass.progress', { n: data.visited, m: data.venues.length })}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">
                        {nextTier
                          ? t('pass.next', {
                              k: remaining,
                              tier: t(`pass.tier.${nextTier.key}` as TranslationKey),
                            })
                          : t('pass.done.all')}
                      </p>
                    </div>
                  </div>

                  {/* ---- Tier strip, the next one highlighted ---- */}
                  <div className="mt-6 grid grid-cols-3 gap-2">
                    {data.tiers.map((tier) => {
                      const isNext = nextTier?.threshold === tier.threshold;
                      return (
                        <div
                          key={tier.key}
                          className={`rounded-2xl border px-2 py-3 text-center text-[11px] ${
                            tier.earned
                              ? 'border-[#F7A30C]/50 bg-[#F7A30C]/10 text-[#FFC45A]'
                              : isNext
                                ? 'border-white/25 bg-white/[0.05] text-white'
                                : 'border-white/[0.07] bg-hero-deep/40 text-slate-500'
                          }`}
                        >
                          <img
                            src={TIER_ART[tier.key]}
                            alt=""
                            width={44}
                            height={44}
                            className={`mx-auto block h-11 w-11 object-contain ${tier.earned ? 'drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)]' : 'opacity-40 grayscale'}`}
                          />
                          <span className="tnum mt-1.5 block">{t('pass.tier.n', { n: tier.threshold })}</span>
                          {tier.earned ? (
                            <span className="block font-semibold">{t('pass.tier.got')}</span>
                          ) : isNext ? (
                            <span className="block font-medium">{t('pass.tier.next')}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2.5 text-center text-[11px] text-slate-500">{t('pass.exclusive')}</p>

                  {/* ---- Issued medals (with their proof) ---- */}
                  {mintedTrophies.length > 0 && (
                    <div className="mt-6 space-y-2">
                      <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {t('pass.trophies.title')}
                      </h2>
                      {mintedTrophies.map((tier) => (
                        <div
                          key={tier.key}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-[#F7A30C]/35 bg-[#F7A30C]/[0.06] px-4 py-2.5"
                        >
                          <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-[#FFC45A]">
                            <img src={TIER_ART[tier.key]} alt="" width={36} height={36} className="h-9 w-9 object-contain" />
                            <span className="truncate capitalize">{t(`pass.tier.${tier.key}` as TranslationKey)}</span>
                            {tier.bits > 0 && (
                              <span className="tnum shrink-0 text-[11px] font-medium text-emerald-300">+{tier.bits} BITS</span>
                            )}
                          </span>
                          {/* One human link instead of two hashes. */}
                          {tier.assetId && (
                            <a
                              href={explorerAddress(tier.assetId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.07] px-3 py-1 text-[11px] text-white transition hover:bg-white/[0.14]"
                            >
                              <Glyph name="shield" className="h-3 w-3" />
                              {t('col.verify.s')}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {pendingMint && (
                    <p className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center text-xs text-slate-300">
                      <Glyph name="clock" className="h-3.5 w-3.5 text-[#FFC45A]" />
                      {t('pass.trophy.pending')}
                    </p>
                  )}

                  {/* ---- The album: visited venues stamped, the rest silhouettes ---- */}
                  <div className="mt-7 grid grid-cols-3 gap-2.5">
                    {data.venues.map((v, i) => (
                      <Link
                        key={v.slug}
                        to={`/loyalty/${v.slug}`}
                        className={`relative flex min-h-[112px] flex-col items-center justify-center overflow-hidden rounded-2xl border px-2 pb-2.5 pt-4 text-center transition ${
                          v.visited
                            ? 'border-[#F7A30C]/45 bg-[#F7A30C]/[0.07] hover:bg-[#F7A30C]/[0.12]'
                            : 'border-dashed border-white/15 bg-hero-deep/40 hover:border-white/30'
                        }`}
                      >
                        {v.visited && (
                          /* Rubber-stamp seal, thumped into the page once. */
                          <motion.span
                            initial={reduceMotion ? false : { scale: 2, opacity: 0, rotate: 10 }}
                            animate={{ scale: 1, opacity: 1, rotate: -12 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 26, delay: Math.min(i * 0.07, 0.6) }}
                            className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full border-2 border-[#F7A30C]/85 text-[#F7A30C]"
                          >
                            <span aria-hidden className="absolute inset-[3px] rounded-full border border-dashed border-[#F7A30C]/50" />
                            <Glyph name="check" className="h-3 w-3" strokeWidth={3} />
                          </motion.span>
                        )}
                        {v.icon ? (
                          <span className={`text-3xl leading-none ${v.visited ? '' : 'opacity-40 grayscale'}`}>{v.icon}</span>
                        ) : (
                          <Glyph name="stamp" className={`h-7 w-7 ${v.visited ? 'text-[#FFC45A]' : 'text-slate-600'}`} strokeWidth={1.5} />
                        )}
                        <span className={`mt-1.5 line-clamp-2 text-[11px] font-medium leading-snug ${v.visited ? 'text-white' : 'text-slate-500'}`}>
                          {v.name}
                        </span>
                        {v.visited && (
                          <span className="tnum mt-0.5 text-[9px] text-[#FFC45A]/80">
                            {t('pass.visits', { n: v.stamps })}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                  {data.visited === 0 && <p className="mt-4 text-center text-sm text-slate-400">{t('pass.empty')}</p>}

                  {/* ---- Next step, concrete. Name + address, never a distance. ---- */}
                  {nextTier && nextVenue && (
                    <Link
                      to={`/loyalty/${nextVenue.slug}`}
                      className="mt-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-hero-deep transition hover:bg-slate-100"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F7A30C] text-hero-deep">
                        <Glyph name="pin" className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{t('pass.cta.title', { name: nextVenue.name })}</span>
                        {nextVenue.address && (
                          <span className="mt-0.5 block truncate text-xs text-slate-600">{nextVenue.address}</span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-slate-500">{t('pass.cta.hint')}</span>
                      </span>
                      <Glyph name="arrow" className="h-5 w-5 text-hero-deep/60" />
                    </Link>
                  )}
                </div>
              </div>

              {/* Machine-readable zone: the two OCR lines every passport ends
                 with. Pure flavour, pure CSS. */}
              <div
                aria-hidden
                className="select-none border-t border-[#F7A30C]/20 bg-[#051538] px-6 py-2.5 font-mono text-[10px] leading-relaxed tracking-[0.18em] text-white/30"
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
      </div>
    </section>
  );
}
