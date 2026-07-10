import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';

import { getJson } from '../services/apiClient';

// Profile → Loyalty section. Shows the user's cross-venue loyalty footprint:
// lifetime stamps, completed cards, and per-venue progress. Trophies themselves
// need no code here — they are cNFTs in the same collection the Collectibles
// grid already renders.

interface StatsResponse {
  ok: true;
  totalStamps: number;
  cardsCompleted: number;
  trophiesMinted: number;
  venues: Array<{
    slug: string;
    name: string;
    current: number;
    required: number;
    cardsCompleted: number;
  }>;
}

export default function LoyaltyStats() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mt-8 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6">
      <h2 className="font-display text-lg font-semibold text-white">⚡ Power Pass</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Your hero cards at partner venues. Every purchase charges Super Victor —
        a full card earns a free reward <em>and</em> a SuperVictor Trophy minted
        into your collection.
      </p>

      {error ? (
        <p className="mt-3 text-sm text-slate-500">Could not load loyalty stats.</p>
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
            <div className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3 text-center">
              <p className="font-display text-2xl font-bold text-hero-cyan">
                {stats.totalStamps}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                ☕ Stamps
              </p>
            </div>
            <div className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3 text-center">
              <p className="font-display text-2xl font-bold text-solana-green">
                {stats.cardsCompleted}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                🎁 Rewards claimed
              </p>
            </div>
            <div className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3 text-center">
              <p className="font-display text-2xl font-bold text-hero-gold">
                {stats.trophiesMinted}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                🏆 Trophies minted
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {stats.venues.map((v) => (
              <li
                key={v.slug}
                className="flex items-center justify-between rounded-xl border border-hero-blue/10 bg-hero-deep/40 px-4 py-3 text-sm"
              >
                <Link to={`/loyalty/${v.slug}`} className="text-slate-200 hover:text-white">
                  {v.name}
                </Link>
                <span className="font-mono text-slate-400">
                  {Math.min(v.current, v.required)}/{v.required}
                  {v.cardsCompleted > 0 && (
                    <span
                      className="ml-2 text-solana-green"
                      title="Rewards claimed at this venue"
                    >
                      🎁×{v.cardsCompleted}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[11px] text-slate-600">
            Trophies earned at redemption appear in your collectibles below.
          </p>
        </>
      )}
    </div>
  );
}
