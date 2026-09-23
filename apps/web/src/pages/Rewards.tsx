import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import { getJson, postJson } from '../services/apiClient';
import { hapticTap } from '../services/platformService';
import { useT } from '../i18n';
import Glyph from '../components/Glyph';

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

  // The one sentence that turns a balance into a goal: the cheapest thing in
  // stock that is still out of reach, or the dearest one already affordable.
  const inStock = (items ?? []).filter((i) => i.inStock).sort((a, b) => a.priceBits - b.priceBits);
  const nextUp = bits === null ? null : inStock.find((i) => i.priceBits > bits) ?? null;
  const affordable = bits === null ? null : [...inStock].reverse().find((i) => i.priceBits <= bits) ?? null;

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-16">
        {/* ---- Head: what this page is, and the wallet beside it ---- */}
        <div className="grid items-end gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#F7A30C]">{t('rw.eyebrow')}</p>
            <h1 className="mt-2 text-balance font-display text-3xl font-bold leading-tight text-white md:text-4xl">
              {t('rw.title')}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">{t('rw.sub')}</p>
          </div>

          <div
            className="relative overflow-hidden rounded-[28px] p-5 text-white shadow-[0_30px_60px_-28px_rgba(3,10,35,0.8)] ring-1 ring-white/10"
            style={{
              background:
                'radial-gradient(90% 80% at 100% 0%, rgba(247,163,12,0.22), transparent 55%),' +
                'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px),' +
                'linear-gradient(145deg, #14357F 0%, #0A2766 42%, #061A47 100%)',
            }}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">{t('rw.balance')}</p>
              <Glyph name="bolt" className="h-5 w-5 text-[#F7A30C]" />
            </div>
            {ready && authenticated ? (
              <>
                <p className="tnum mt-2 font-display text-5xl font-bold leading-none">{bits ?? '…'}</p>
                {nextUp && bits !== null ? (
                  <>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#F7A30C]"
                        style={{ width: `${Math.min(100, Math.round((bits / nextUp.priceBits) * 100))}%` }}
                      />
                    </div>
                    <p className="mt-2 truncate text-xs text-white/70">
                      {t('rw.next', { n: nextUp.priceBits - bits, name: nextUp.name })}
                    </p>
                  </>
                ) : affordable ? (
                  <p className="mt-4 truncate text-xs font-semibold text-[#FFC45A]">
                    {t('rw.enough', { name: affordable.name })}
                  </p>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                onClick={() => login()}
                disabled={!ready}
                className="mt-4 w-full rounded-full bg-[#F7A30C] px-4 py-2.5 text-sm font-semibold text-hero-deep transition hover:bg-[#FFB42A] disabled:opacity-50"
              >
                {t('rw.login')}
              </button>
            )}
          </div>
        </div>

        {notice && (
          <p
            className={`mx-auto mt-6 max-w-md rounded-xl border px-4 py-2 text-center text-sm ${
              notice.kind === 'ok'
                ? 'border-solana-green/40 bg-solana-green/10 text-solana-green'
                : 'border-red-400/40 bg-red-500/10 text-red-200'
            }`}
          >
            {notice.text}
          </p>
        )}

        {/* ---- My open codes: tickets to show at the counter ---- */}
        {pending.length > 0 && (
          <div className="mt-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FFC45A]">{t('rw.mine.title')}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {pending.map((c) => (
                <div
                  key={c.id}
                  className="relative flex overflow-hidden rounded-3xl border border-[#F7A30C]/40 bg-hero-navy shadow-[0_20px_40px_-28px_rgba(0,0,0,0.9)]"
                >
                  <div className="grid w-20 shrink-0 place-items-center bg-[#F7A30C]/10">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="h-14 w-14 object-contain" loading="lazy" />
                    ) : (
                      <Glyph name="gift" className="h-7 w-7 text-[#FFC45A]" />
                    )}
                  </div>
                  {/* perforation between stub and ticket */}
                  <span aria-hidden className="w-0 border-l-2 border-dashed border-[#F7A30C]/30" />
                  <div className="min-w-0 flex-1 p-4">
                    <p className="truncate text-sm font-semibold text-white">{c.itemName}</p>
                    <p className="tnum mt-1 font-mono text-2xl font-bold tracking-[0.25em] text-[#FFC45A]">{c.code}</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-400">
                      {t('rw.mine.hint', { d: daysLeft(c.expiresAt) })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- The shelf ---- */}
        <div className="mt-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{t('rw.shelf.title')}</h2>

          {items === null ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-80 animate-pulse rounded-[28px] border border-white/[0.06] bg-hero-navy/60" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="mt-3 flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-white/15 px-6 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/[0.06] text-slate-400">
                <Glyph name="gift" className="h-6 w-6" />
              </span>
              <p className="max-w-xs text-sm text-slate-400">{t('rw.shelf.empty')}</p>
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {items.map((item) => {
                const canAfford = bits !== null && bits >= item.priceBits;
                const hasCode = pendingBySlug.has(item.slug);
                const disabled = !authenticated || !item.inStock || hasCode || !canAfford || busy === item.slug;
                const pct = bits === null ? 0 : Math.min(100, Math.round((bits / item.priceBits) * 100));
                return (
                  <div
                    key={item.slug}
                    className={`group flex flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-hero-navy shadow-[0_24px_48px_-32px_rgba(0,0,0,0.9)] ${
                      item.inStock ? '' : 'opacity-60'
                    }`}
                  >
                    <div
                      className="relative aspect-[4/3] w-full"
                      style={{
                        background:
                          'radial-gradient(60% 60% at 50% 55%, rgba(247,163,12,0.18), transparent 70%), linear-gradient(180deg, #13306F 0%, #0B1F4D 100%)',
                      }}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          loading="lazy"
                          className="h-full w-full object-contain p-6 drop-shadow-[0_16px_20px_rgba(0,0,0,0.45)] transition duration-300 group-hover:scale-[1.03]"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-[#FFC45A]">
                          <Glyph name="gift" className="h-14 w-14" strokeWidth={1.4} />
                        </div>
                      )}
                      <span className="tnum absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-hero-deep/90 px-3 py-1 font-display text-sm font-bold text-white ring-1 ring-white/10">
                        <Glyph name="bolt" className="h-4 w-4 text-[#F7A30C]" />
                        {item.priceBits}
                      </span>
                      {!item.inStock && (
                        <span className="absolute left-3 top-3 rounded-full bg-hero-deep/90 px-2.5 py-1 text-[11px] text-slate-300">
                          {t('rw.soldout')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-5">
                      <p className="font-display text-lg font-semibold text-white">{item.name}</p>
                      {item.description && (
                        <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.description}</p>
                      )}
                      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500">
                        <Glyph name="pin" className="mt-px h-3.5 w-3.5" />
                        {item.pickupAt.length > 0
                          ? t('rw.pickup.at', { v: item.pickupAt.map((v) => v.name).join(', ') })
                          : t('rw.pickup.any')}
                      </p>

                      <div className="mt-auto pt-4">
                        {/* How close this one is, when it is not yet in reach. */}
                        {authenticated && bits !== null && !canAfford && item.inStock && !hasCode && (
                          <div className="mb-3">
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                              <div className="h-full rounded-full bg-[#F7A30C]/80" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="tnum mt-1.5 text-[11px] text-slate-500">
                              {t('rw.have', { a: bits, b: item.priceBits })}
                            </p>
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={disabled && authenticated}
                          onClick={() => (authenticated ? void claim(item) : login())}
                          className={`flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                            hasCode
                              ? 'bg-white/[0.06] text-[#FFC45A]'
                              : canAfford && item.inStock
                                ? 'bg-[#F7A30C] text-hero-deep hover:bg-[#FFB42A]'
                                : !authenticated
                                  ? 'bg-white text-hero-deep hover:bg-slate-200'
                                  : 'bg-white/[0.06] text-slate-400'
                          } disabled:cursor-not-allowed`}
                        >
                          {hasCode && <Glyph name="check" className="h-4 w-4" strokeWidth={2.4} />}
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
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- History ---- */}
        {history.length > 0 && (
          <div className="mt-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{t('rw.history')}</h2>
            <ul className="mt-3 divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.07] bg-hero-navy/60">
              {history.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-xs">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                      c.status === 'fulfilled' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.05] text-slate-500'
                    }`}
                  >
                    <Glyph name={c.status === 'fulfilled' ? 'check' : 'clock'} className="h-3.5 w-3.5" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-200">{c.itemName}</span>
                  <span className="shrink-0 text-right text-slate-500">
                    {c.status === 'fulfilled'
                      ? `${c.fulfilledAt_venue ?? t('rw.given')} · ${fmtDate(c.fulfilledAt ?? c.createdAt)}`
                      : c.status === 'expired'
                        ? t('rw.st.expired')
                        : t('rw.st.cancelled')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-10 text-center text-[11px] leading-relaxed text-slate-500">
          {t('rw.footnote')}{' '}
          <Link to="/profile" className="text-white underline underline-offset-2">
            {t('nav.profile')}
          </Link>
        </p>
      </div>

      {/* ---- Just claimed: the code, as a ticket ---- */}
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
              className="w-full max-w-sm overflow-hidden rounded-[28px] text-center ring-1 ring-[#F7A30C]/50"
              style={{
                background:
                  'radial-gradient(90% 60% at 50% 0%, rgba(247,163,12,0.25), transparent 60%),' +
                  'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px),' +
                  'linear-gradient(145deg, #14357F 0%, #0A2766 42%, #061A47 100%)',
              }}
            >
              <div className="p-6">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#F7A30C] text-hero-deep">
                  <Glyph name="gift" className="h-7 w-7" strokeWidth={2} />
                </span>
                <p className="mt-3 font-display text-2xl font-bold text-white">{t('rw.done.title')}</p>
                <p className="mt-1 text-sm text-slate-300">{justClaimed.name}</p>
              </div>
              <div className="border-t-2 border-dashed border-white/15 px-6 pb-6 pt-5">
                <p className="tnum font-mono text-4xl font-bold tracking-[0.3em] text-[#FFC45A]">{justClaimed.code}</p>
                <p className="mt-4 text-xs leading-relaxed text-slate-300">{t('rw.done.body')}</p>
                <button
                  type="button"
                  onClick={() => setJustClaimed(null)}
                  className="mt-5 w-full rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-hero-deep transition hover:bg-slate-200"
                >
                  {t('pp.close')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
