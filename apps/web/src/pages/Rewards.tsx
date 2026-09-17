import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import { getJson, postJson } from '../services/apiClient';
import { hapticTap } from '../services/platformService';
import { useT } from '../i18n';

// /rewards — what BITS actually buy.
// ---------------------------------------------------------------------------
// The shelf is PUBLIC: someone who scanned a QR five minutes ago and has not
// logged in yet can still see the pin and its price. That is the entire
// reason this page exists — BITS was a number with no shop, and "what do I
// do with these?" had no answer a café owner could point at.
//
// Claim = spend BITS now, get a 6-character code, say it at the counter.
// The code lives 14 days; unused, it expires and the BITS come back.

interface CatalogItem {
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceBits: number;
  inStock: boolean;
  stock: number | null;
  pickupAt: Array<{ slug: string; name: string }>;
}

interface MyClaim {
  id: string;
  itemSlug: string | null;
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

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default function Rewards() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { t, lang } = useT();

  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [bits, setBits] = useState<number | null>(null);
  const [claims, setClaims] = useState<MyClaim[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [justClaimed, setJustClaimed] = useState<{ name: string; code: string } | null>(null);

  // The shelf loads for everyone.
  useEffect(() => {
    let active = true;
    getJson<{ ok: true; items: CatalogItem[] }>('/api/rewards/catalog')
      .then((r) => active && setItems(r.items))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, []);

  // Balance + my codes, once logged in.
  const loadMine = useCallback(async () => {
    if (!ready || !authenticated) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const r = await getJson<{ ok: true; bits: number; claims: MyClaim[] }>(
        '/api/rewards/me',
        token
      );
      setBits(r.bits);
      setClaims(r.claims);
    } catch {
      /* balance stays unknown; the shelf still shows */
    }
  }, [ready, authenticated, getAccessToken]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  // While a code is open, poll: the moment the barista types it, the ticket
  // moves from "Your codes" to "Earlier" on this screen without a reload —
  // the customer sees the hand-over land while it happens.
  const hasPending = claims.some((c) => c.status === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    const id = window.setInterval(() => void loadMine(), 8000);
    return () => window.clearInterval(id);
  }, [hasPending, loadMine]);

  const claim = async (item: CatalogItem) => {
    setBusy(item.slug);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<Record<string, never>, { ok: true; code: string; bits: number }>(
        `/api/rewards/${item.slug}/claim`,
        {},
        token ?? undefined
      );
      hapticTap(20);
      setBits(r.bits);
      setJustClaimed({ name: item.name, code: r.code });
      await loadMine();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const pending = claims.filter((c) => c.status === 'pending');
  const pendingBySlug = new Set(pending.map((c) => c.itemSlug));
  const history = claims.filter((c) => c.status !== 'pending').slice(0, 10);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  };

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />

      <div className="mx-auto max-w-3xl px-6 py-10 md:py-16">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-hero-cyan">{t('rw.eyebrow')}</p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">{t('rw.title')}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{t('rw.sub')}</p>
        </div>

        {/* ---- Balance pill ---- */}
        <div className="mt-6 flex justify-center">
          {ready && authenticated ? (
            <div className="card-sm flex items-baseline gap-2 px-6 py-3 text-center">
              <span className="tnum font-display text-3xl font-bold text-white">
                {bits ?? '…'}
              </span>
              <span className="text-sm text-slate-400">⚡ BITS</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => login()}
              disabled={!ready}
              className="btn btn-primary"
            >
              {t('rw.login')}
            </button>
          )}
        </div>

        {notice && (
          <p
            className={`mx-auto mt-4 max-w-md rounded-xl border px-4 py-2 text-center text-sm ${
              notice.kind === 'ok'
                ? 'border-solana-green/40 bg-solana-green/10 text-solana-green'
                : 'border-red-400/40 bg-red-500/10 text-red-200'
            }`}
          >
            {notice.text}
          </p>
        )}

        {/* ---- My open codes — the thing to show at the counter ---- */}
        {pending.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-hero-gold">
              {t('rw.mine.title')}
            </h2>
            <div className="mt-3 space-y-3">
              {pending.map((c) => (
                <div
                  key={c.id}
                  className="card-sm card-gold flex items-center gap-4 border-hero-gold/60 p-4"
                >
                  {c.imageUrl && (
                    <img
                      src={c.imageUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{c.itemName}</p>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-[0.25em] text-hero-gold">
                      {c.code}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {t('rw.mine.hint', { d: daysLeft(c.expiresAt) })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- The shelf ---- */}
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('rw.shelf.title')}
          </h2>

          {items === null ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="card-sm h-64 animate-pulse"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">
              {t('rw.shelf.empty')}
            </p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {items.map((item) => {
                const canAfford = bits !== null && bits >= item.priceBits;
                const hasCode = pendingBySlug.has(item.slug);
                const disabled =
                  !authenticated || !item.inStock || hasCode || !canAfford || busy === item.slug;
                return (
                  <div
                    key={item.slug}
                    className={`card-sm overflow-hidden ${item.inStock ? '' : 'opacity-60'}`}
                  >
                    <div className="relative aspect-square w-full bg-hero-navy2">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          loading="lazy"
                          className="h-full w-full object-contain p-6"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-5xl">🎁</div>
                      )}
                      <span className="tnum absolute right-3 top-3 rounded-full border border-white/15 bg-hero-deep px-3 py-1 font-display text-sm font-bold text-white">
                        ⚡ {item.priceBits}
                      </span>
                      {!item.inStock && (
                        <span className="absolute left-3 top-3 rounded-full bg-hero-deep/90 px-2.5 py-1 text-[11px] text-slate-300">
                          {t('rw.soldout')}
                        </span>
                      )}
                    </div>

                    <div className="p-4">
                      <p className="font-display text-lg font-semibold text-white">{item.name}</p>
                      {item.description && (
                        <p className="mt-1 text-sm leading-relaxed text-slate-400">
                          {item.description}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] text-slate-500">
                        📍{' '}
                        {item.pickupAt.length > 0
                          ? t('rw.pickup.at', { v: item.pickupAt.map((v) => v.name).join(', ') })
                          : t('rw.pickup.any')}
                      </p>

                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => (authenticated ? void claim(item) : login())}
                        className="btn btn-primary btn-sm mt-3 w-full"
                      >
                        {busy === item.slug
                          ? '…'
                          : hasCode
                          ? t('rw.btn.hascode')
                          : !authenticated
                          ? t('rw.btn.login')
                          : !item.inStock
                          ? t('rw.soldout')
                          : canAfford
                          ? t('rw.btn.claim')
                          : t('rw.btn.short', { n: item.priceBits - (bits ?? 0) })}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- History ---- */}
        {history.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t('rw.history')}
            </h2>
            <ul className="mt-2 space-y-1">
              {history.map((c) => (
                <li
                  key={c.id}
                  className="flex items-baseline justify-between gap-3 rounded-lg bg-hero-navy px-3 py-2 text-xs"
                >
                  <span className="truncate text-slate-300">{c.itemName}</span>
                  <span className="shrink-0 text-slate-500">
                    {c.status === 'fulfilled'
                      ? `✓ ${c.fulfilledAt_venue ?? ''} · ${fmtDate(c.fulfilledAt ?? c.createdAt)}`
                      : c.status === 'expired'
                      ? t('rw.st.expired')
                      : t('rw.st.cancelled')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-600">
          {t('rw.footnote')}{' '}
          <Link to="/profile" className="text-hero-cyan underline">
            {t('nav.profile')}
          </Link>
        </p>
      </div>

      {/* ---- Just claimed: the code, big, centred ---- */}
      <AnimatePresence>
        {justClaimed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-hero-deep/85 px-6 backdrop-blur-sm"
            onClick={() => setJustClaimed(null)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="card w-full max-w-sm border-hero-gold/60 p-6 text-center"
            >
              <p className="text-3xl">🎁</p>
              <p className="mt-2 font-display text-xl font-bold text-white">
                {t('rw.done.title')}
              </p>
              <p className="mt-1 text-sm text-slate-300">{justClaimed.name}</p>
              <p className="mt-4 font-mono text-4xl font-bold tracking-[0.3em] text-hero-gold">
                {justClaimed.code}
              </p>
              <p className="mt-4 text-xs leading-relaxed text-slate-400">{t('rw.done.body')}</p>
              <button
                type="button"
                onClick={() => setJustClaimed(null)}
                className="btn btn-primary mt-5 w-full"
              >
                {t('pp.close')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
