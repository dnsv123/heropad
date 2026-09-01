import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import { getJson } from '../services/apiClient';
import { explorerAddress } from '../lib/explorer';
import { useT } from '../i18n';

// Profile → Power Pass widget. Three stat tiles; EACH opens its own specific
// detail sheet:
//   ☕ Stamps   → per-venue mug grids (all lifetime stamps, venue named)
//   🎁 Rewards  → per-venue rewards with the venue's own reward label
//   🏆 Trophies → SuperVictor trophy gallery: graphic, venue, date, edition,
//                 clickable mint-tx + asset links to Solana Explorer (the
//                 on-chain PROOF).
// Brand rule: the character is written "SuperVictor" — one word, everywhere.

interface TrophyDetail {
  venueName: string;
  edition: number;
  assetId: string;
  mintTx: string | null;
  redeemedAt: string;
}

interface VenueStat {
  slug: string;
  name: string;
  current: number;
  required: number;
  totalStamps: number;
  cardsCompleted: number;
  rewardLabel: string | null;
}

interface RewardDetail {
  venueName: string;
  label: string;
  stampsConsumed: number;
  redeemedAt: string;
}

interface StatsResponse {
  ok: true;
  totalStamps: number;
  cardsCompleted: number;
  trophiesMinted: number;
  rewardsDetail: RewardDetail[];
  trophies: TrophyDetail[];
  venues: VenueStat[];
}

type DetailKind = 'stamps' | 'rewards' | 'trophies' | null;

const assetUrl = explorerAddress;
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function LoyaltyStats() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { t } = useT();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailKind>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await getJson<StatsResponse>('/api/loyalty/me/stats', token);
        if (active) setStats(r);
      } catch (err) {
        if (active) setError((err as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authenticated, getAccessToken]);

  if (!ready || !authenticated) return null;

  return (
    <div className="rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6">
      <h2 className="font-display text-lg font-semibold text-white">⚡ Power Pass</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{t('pp.explainer')}</p>

      {error ? (
        <p className="mt-3 text-sm text-slate-500">{t('pp.error')}</p>
      ) : !stats ? (
        <p className="mt-3 text-sm text-slate-500">{t('pp.loading')}</p>
      ) : stats.totalStamps === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          {t('pp.empty.pre')}{' '}
          <Link to="/loyalty/cafe-victor" className="text-hero-cyan underline">
            {t('pp.empty.link')}
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setDetail('stamps')}
              className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3 text-center transition hover:border-hero-cyan/50 hover:bg-hero-deep"
            >
              <p className="font-display text-2xl font-bold text-hero-cyan">
                {stats.totalStamps}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                {t('pp.tile.stamps')}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setDetail('rewards')}
              className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3 text-center transition hover:border-solana-green/50 hover:bg-hero-deep"
            >
              <p className="font-display text-2xl font-bold text-solana-green">
                {stats.cardsCompleted}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                {t('pp.tile.rewards')}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setDetail('trophies')}
              className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3 text-center transition hover:border-hero-gold/50 hover:bg-hero-deep"
            >
              <p className="font-display text-2xl font-bold text-hero-gold">
                {stats.trophiesMinted}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                {t('pp.tile.trophies')}
              </p>
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-600">{t('pp.taphint')}</p>

          {/* The cross-venue passport: collect cafés, not just coffees. */}
          <Link
            to="/passport"
            className="mt-3 flex items-center justify-between rounded-xl border border-hero-gold/25 bg-hero-gold/5 px-4 py-2.5 text-sm transition hover:border-hero-gold/50 hover:bg-hero-gold/10"
          >
            <span className="text-slate-200">🗺️ {t('pp.passport')}</span>
            <span className="font-mono text-xs text-slate-400">
              {stats.venues.length} <span className="text-hero-gold">→</span>
            </span>
          </Link>

          {/* Quick links: jump straight to each venue's loyalty page. */}
          {stats.venues.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                {t('pp.venues.label')}
              </p>
              {stats.venues.map((v) => (
                <Link
                  key={v.slug}
                  to={`/loyalty/${v.slug}`}
                  className="flex items-center justify-between rounded-xl border border-hero-blue/10 bg-hero-deep/40 px-4 py-2.5 text-sm transition hover:border-hero-cyan/50 hover:bg-hero-deep/70"
                >
                  <span className="text-slate-200">☕ {v.name}</span>
                  <span className="font-mono text-xs text-slate-400">
                    {Math.min(v.current, v.required)}/{v.required}{' '}
                    <span className="text-hero-cyan">→</span>
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* ---- Detail sheets (one per tile) ---- */}
          <AnimatePresence>
            {detail && (
              <motion.div
                key="pp-detail-bg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDetail(null)}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 12 }}
                  transition={{ duration: 0.25 }}
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-hero-blue/30 bg-hero-deep p-5 shadow-2xl"
                >
                  {/* ---------- ☕ STAMPS ---------- */}
                  {detail === 'stamps' && (
                    <>
                      <h3 className="text-center font-display text-lg font-semibold text-hero-cyan">
                        {t('pp.sheet.stamps', { n: stats.totalStamps })}
                      </h3>
                      <div className="mt-4 space-y-4">
                        {stats.venues
                          .filter((v) => v.totalStamps > 0)
                          .map((v) => (
                            <div
                              key={v.slug}
                              className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-4"
                            >
                              <div className="flex items-baseline justify-between">
                                <Link
                                  to={`/loyalty/${v.slug}`}
                                  className="text-sm font-medium text-slate-200 hover:text-white"
                                >
                                  {v.name}
                                </Link>
                                <span className="font-mono text-xs text-hero-cyan">
                                  {t('pp.stamps.n', { n: v.totalStamps })}
                                </span>
                              </div>
                              {/* All lifetime stamps, wrapping in rows of 10 */}
                              <div className="mt-3 grid grid-cols-10 gap-1 text-base leading-none">
                                {Array.from({ length: v.totalStamps }, (_, i) => (
                                  <span key={i}>☕</span>
                                ))}
                              </div>
                              <p className="mt-2 text-[11px] text-slate-500">
                                {t('pp.current', {
                                  s: Math.min(v.current, v.required),
                                  r: v.required,
                                })}
                              </p>
                            </div>
                          ))}
                      </div>
                    </>
                  )}

                  {/* ---------- 🎁 REWARDS ---------- */}
                  {detail === 'rewards' && (
                    <>
                      <h3 className="text-center font-display text-lg font-semibold text-solana-green">
                        {t('pp.sheet.rewards', { n: stats.cardsCompleted })}
                      </h3>
                      {stats.rewardsDetail.length === 0 ? (
                        <p className="mt-4 text-center text-sm text-slate-500">
                          {t('pp.rewards.empty')}
                        </p>
                      ) : (
                        <div className="mt-4 space-y-2">
                          {stats.rewardsDetail.map((r, i) => (
                            <div
                              key={`${r.redeemedAt}-${i}`}
                              className="flex items-center gap-3 rounded-xl border border-solana-green/20 bg-solana-green/5 px-4 py-3"
                            >
                              <span className="text-xl">🎁</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-200">
                                  {r.label || t('pp.reward.generic')}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {r.venueName} · {formatDate(r.redeemedAt)} ·{' '}
                                  {r.stampsConsumed} {t('pp.stampsword')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* ---------- 🏆 TROPHIES ---------- */}
                  {detail === 'trophies' && (
                    <>
                      <h3 className="text-center font-display text-lg font-semibold text-hero-gold">
                        {t('pp.sheet.trophies', { n: stats.trophiesMinted })}
                      </h3>
                      {stats.trophies.length === 0 ? (
                        <p className="mt-4 text-center text-sm text-slate-500">
                          {t('pp.trophies.empty')}
                        </p>
                      ) : (
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          {/* `trophy`, not `t` — the map used to shadow the
                              translate function, which made every label in
                              here impossible to translate. */}
                          {stats.trophies.map((trophy) => (
                            <div
                              key={trophy.assetId}
                              className="rounded-xl border border-hero-gold/40 bg-hero-gold/5 p-3 text-center"
                            >
                              <div className="relative mx-auto aspect-square w-20">
                                <div
                                  aria-hidden
                                  className="absolute inset-0 rounded-full bg-hero-gold/20 blur-md"
                                />
                                <img
                                  src="/cnft/trophy-starter.webp"
                                  alt={`SuperVictor Trophy — ${trophy.venueName} #${trophy.edition}`}
                                  className="relative h-full w-full object-contain"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display =
                                      'none';
                                  }}
                                />
                                <span className="absolute -bottom-1 -right-1 text-lg">
                                  🏆
                                </span>
                              </div>
                              <p className="mt-2 text-xs font-semibold text-hero-gold">
                                {trophy.venueName} #{trophy.edition}
                              </p>
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                {formatDate(trophy.redeemedAt)}
                              </p>
                              <div className="mt-2 flex justify-center gap-2 text-[10px]">
                                <a
                                  href={assetUrl(trophy.assetId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-full border border-hero-cyan/40 px-2 py-0.5 text-hero-cyan transition hover:bg-hero-cyan/10"
                                >
                                  {t('col.verify.s')}
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="mt-5 w-full rounded-full bg-hero-gold px-4 py-2 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
                  >
                    {t('pp.close')}
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
