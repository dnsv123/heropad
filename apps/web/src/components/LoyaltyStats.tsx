import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';

import { getJson } from '../services/apiClient';

// Profile → Power Pass widget. Three stat tiles (stamps / rewards / trophies),
// each tappable — they open a visual detail sheet: per-venue mug strips,
// rewards with venue names, and a trophy gallery with Explorer links.
// Naming: the character is "Super Victor" (two words) everywhere user-facing.

interface TrophyDetail {
  venueName: string;
  edition: number;
  assetId: string;
  redeemedAt: string;
}

interface StatsResponse {
  ok: true;
  totalStamps: number;
  cardsCompleted: number;
  trophiesMinted: number;
  trophies: TrophyDetail[];
  venues: Array<{
    slug: string;
    name: string;
    current: number;
    required: number;
    cardsCompleted: number;
  }>;
}

function explorerUrl(assetId: string): string {
  return `https://explorer.solana.com/address/${assetId}?cluster=devnet`;
}

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
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let active = true;
    (async () => {
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

  const tiles = stats
    ? [
        { value: stats.totalStamps, label: '☕ Stamps', color: 'text-hero-cyan' },
        { value: stats.cardsCompleted, label: '🎁 Rewards claimed', color: 'text-solana-green' },
        { value: stats.trophiesMinted, label: '🏆 Trophies minted', color: 'text-hero-gold' },
      ]
    : [];

  return (
    <div className="rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6">
      <h2 className="font-display text-lg font-semibold text-white">⚡ Power Pass</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Your hero cards at partner venues. Every purchase charges Super Victor —
        a full card earns a free reward, a <strong>Super Victor Trophy</strong>{' '}
        minted into your collection, and BITS.
      </p>

      {error ? (
        <p className="mt-3 text-sm text-slate-500">Could not load your Power Pass.</p>
      ) : !stats ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : stats.totalStamps === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          No hero cards yet. Scan the Power Pass QR at a partner café and your
          first card starts automatically —{' '}
          <Link to="/loyalty/cafe-victor" className="text-hero-cyan underline">
            try Café Victor
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {tiles.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setDetailOpen(true)}
                className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3 text-center transition hover:border-hero-cyan/40 hover:bg-hero-deep"
              >
                <p className={`font-display text-2xl font-bold ${t.color}`}>{t.value}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                  {t.label}
                </p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-600">
            Tap any card for details ↑
          </p>

          {/* ---- Detail sheet ---- */}
          <AnimatePresence>
            {detailOpen && (
              <motion.div
                key="pp-detail-bg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDetailOpen(false)}
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
                  <h3 className="text-center font-display text-lg font-semibold text-hero-cyan">
                    ⚡ Your Power Pass
                  </h3>

                  {/* Hero cards — mug strip per venue */}
                  <p className="mt-4 text-xs uppercase tracking-wider text-slate-500">
                    Hero cards
                  </p>
                  <div className="mt-2 space-y-3">
                    {stats.venues.map((v) => (
                      <div
                        key={v.slug}
                        className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3"
                      >
                        <div className="flex items-baseline justify-between">
                          <Link
                            to={`/loyalty/${v.slug}`}
                            className="text-sm font-medium text-slate-200 hover:text-white"
                          >
                            {v.name}
                          </Link>
                          <span className="font-mono text-xs text-slate-400">
                            {Math.min(v.current, v.required)}/{v.required}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1 text-lg leading-none">
                          {Array.from({ length: v.required }, (_, i) => (
                            <span
                              key={i}
                              className={
                                i < Math.min(v.current, v.required)
                                  ? ''
                                  : 'opacity-20 grayscale'
                              }
                            >
                              ☕
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Rewards claimed */}
                  <p className="mt-5 text-xs uppercase tracking-wider text-slate-500">
                    Rewards claimed
                  </p>
                  {stats.cardsCompleted === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      None yet — fill a card to claim your first free reward.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {stats.venues
                        .filter((v) => v.cardsCompleted > 0)
                        .map((v) => (
                          <div
                            key={v.slug}
                            className="flex items-center justify-between rounded-xl border border-solana-green/20 bg-solana-green/5 px-3 py-2 text-sm"
                          >
                            <span className="text-slate-200">{v.name}</span>
                            <span className="text-solana-green">
                              {'🎁'.repeat(Math.min(v.cardsCompleted, 8))}
                              {v.cardsCompleted > 8 ? ` ×${v.cardsCompleted}` : ''}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Trophy gallery */}
                  <p className="mt-5 text-xs uppercase tracking-wider text-slate-500">
                    Super Victor Trophies
                  </p>
                  {stats.trophies.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      No trophies yet — each completed card mints one into your
                      collection.
                    </p>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {stats.trophies.map((t) => (
                        <a
                          key={t.assetId}
                          href={explorerUrl(t.assetId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group rounded-xl border border-hero-gold/40 bg-hero-gold/5 p-3 text-center transition hover:border-hero-gold hover:bg-hero-gold/10"
                        >
                          <div className="relative mx-auto aspect-square w-20">
                            <div
                              aria-hidden
                              className="absolute inset-0 rounded-full bg-hero-gold/20 blur-md"
                            />
                            <img
                              src="/super-victor.png"
                              alt={`Super Victor Trophy — ${t.venueName} #${t.edition}`}
                              className="relative h-full w-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <span className="absolute -bottom-1 -right-1 text-lg">🏆</span>
                          </div>
                          <p className="mt-2 text-xs font-semibold text-hero-gold">
                            {t.venueName} #{t.edition}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {formatDate(t.redeemedAt)} · Explorer ↗
                          </p>
                        </a>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setDetailOpen(false)}
                    className="mt-5 w-full rounded-full bg-hero-gold px-4 py-2 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
                  >
                    Close
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
