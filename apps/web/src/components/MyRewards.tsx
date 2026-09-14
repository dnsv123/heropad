import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '../lib/auth';

import { getJson } from '../services/apiClient';
import { useT } from '../i18n';

// Profile → "Premiile tale". What this account took with BITS: the item,
// its picture, where it was handed over, when, and what it cost. Open codes
// show up first, big, because a code you forgot is BITS you will get back
// in 14 days but a pin you never picked up.

interface MyClaim {
  id: string;
  itemName: string;
  imageUrl: string | null;
  code: string | null;
  priceBits: number;
  status: 'pending' | 'fulfilled' | 'expired' | 'cancelled';
  expiresAt: string;
  fulfilledAt: string | null;
  fulfilledAt_venue: string | null;
  createdAt: string;
}

export default function MyRewards() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { t, lang } = useT();
  const [claims, setClaims] = useState<MyClaim[] | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await getJson<{ ok: true; claims: MyClaim[] }>('/api/rewards/me', token);
        if (active) setClaims(r.claims);
      } catch {
        if (active) setClaims([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authenticated, getAccessToken]);

  if (!claims || claims.length === 0) return null;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const pending = claims.filter((c) => c.status === 'pending');
  const done = claims.filter((c) => c.status === 'fulfilled');

  return (
    <div className="mt-8 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-white">{t('mr.title')}</h2>
        <Link to="/rewards" className="text-xs text-solana-green underline">
          {t('mr.shelf')}
        </Link>
      </div>

      {pending.length > 0 && (
        <div className="mt-4 space-y-2">
          {pending.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border-2 border-hero-gold/60 bg-hero-gold/10 p-3"
            >
              {c.imageUrl && (
                <img src={c.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{c.itemName}</p>
                <p className="font-mono text-xl font-bold tracking-[0.25em] text-hero-gold">{c.code}</p>
                <p className="text-[11px] text-slate-500">{t('mr.pending')}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {done.map((c) => (
            <div
              key={c.id}
              className="overflow-hidden rounded-xl border border-hero-blue/20 bg-hero-deep/60"
            >
              <div className="aspect-square w-full bg-gradient-to-br from-hero-blue/20 via-hero-deep to-hero-deep">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt={c.itemName} className="h-full w-full object-contain p-3" />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl">🎁</div>
                )}
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-semibold text-white">{c.itemName}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {c.fulfilledAt_venue ? `📍 ${c.fulfilledAt_venue}` : ''}
                </p>
                <p className="text-[11px] text-slate-500">
                  {fmt(c.fulfilledAt ?? c.createdAt)} · <span className="text-solana-green">⚡ {c.priceBits}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
