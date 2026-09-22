import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import {
  getUserMe,
  type BitsHistoryEntry,
  type CollectibleSummary,
  type UserMeResponse,
} from '../lib/api';
import { useT, type TranslationKey } from '../i18n';
import { explorerAddress } from '../lib/explorer';
import CollectibleModal from './CollectibleModal';

/** Ledger reasons → human labels (i18n key per reason; raw reason as fallback). */
const REASON_KEY: Record<string, TranslationKey> = {
  stamp: 'col.r.stamp',
  loyalty_trophy: 'col.r.trophy',
  passport_trophy: 'col.r.passport',
  referral_inviter: 'col.r.refinv',
  referral_friend: 'col.r.reffriend',
  claim: 'col.r.claim',
};

/** Collection folders, decided by the certificate's symbol. Order = display order. */
const FOLDERS: Array<{ key: string; icon: string; label: TranslationKey; match: (s: string) => boolean }> = [
  { key: 'venue', icon: '🏆', label: 'col.f.venue', match: (s) => s === 'SVTROPHY' },
  { key: 'passport', icon: '🗺️', label: 'col.f.passport', match: (s) => s === 'SVPASS' },
  { key: 'physical', icon: '🦸', label: 'col.f.physical', match: () => true },
];

interface CollectiblesProps {
  walletAddress: string;
}

// Profile-side widget: BITS earned + grid of cNFTs the wallet owns
// (filtered to HeroPad's Bubblegum tree by the backend).
//
// States:
//   - loading  → skeleton tiles + dimmed BITS pill
//   - empty    → friendly prompt to go to /claim
//   - error    → soft error message with retry
//   - data     → BITS pill + grid of NFT cards
export default function Collectibles({ walletAddress }: CollectiblesProps) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { t, lang } = useT();
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'data'; data: UserMeResponse }
    | { phase: 'error'; message: string }
  >({ phase: 'loading' });
  const [active, setActive] = useState<CollectibleSummary | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const load = async () => {
    setState({ phase: 'loading' });
    try {
      // The endpoint verifies this token owns the wallet, so a missing one is
      // not a retryable error — stay in loading until Privy hands it over.
      const token = await getAccessToken();
      if (!token) return;
      const data = await getUserMe(walletAddress, token);
      setState({ phase: 'data', data });
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Could not load profile data.',
      });
    }
  };

  useEffect(() => {
    // Privy resolves the session asynchronously; firing before `ready` yields a
    // null token and a spurious "not authorized" on an otherwise fine account.
    if (!walletAddress || !ready || !authenticated) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, ready, authenticated]);

  // ---- Loading -----------------------------------------------------------
  if (state.phase === 'loading') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            {t('col.title')}
          </p>
          <div className="h-6 w-24 animate-pulse rounded-full bg-hero-blue/20" />
        </div>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-xl border border-white/[0.08] bg-hero-navy"
            />
          ))}
        </div>
      </div>
    );
  }

  // ---- Error -------------------------------------------------------------
  if (state.phase === 'error') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        <p>{t('col.error')}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 rounded-full border border-red-300/40 px-3 py-1 text-xs hover:border-red-300"
        >
          {t('col.retry')}
        </button>
      </div>
    );
  }

  // ---- Data --------------------------------------------------------------
  const { bits, collectibles } = state.data;
  // Defensive: a cached or older API payload may not carry the field yet —
  // a missing ledger must degrade to "no history", never crash the Profile
  // (which is exactly what it did on deploy day).
  const bitsHistory = state.data.bitsHistory ?? [];

  // Every asset lands in exactly one folder: first matching rule wins, and
  // the last rule matches everything, so nothing can vanish.
  const grouped = FOLDERS.map((f, idx) => ({
    ...f,
    items: collectibles.filter(
      (c) =>
        FOLDERS.findIndex((g) => g.match(c.symbol ?? '')) === idx
    ),
  }));

  const reasonLabel = (e: BitsHistoryEntry): string => {
    const key = REASON_KEY[e.reason];
    const base = key ? t(key) : e.reason;
    const venue = typeof e.metadata?.venue === 'string' ? e.metadata.venue : null;
    return venue ? `${base} · ${venue}` : base;
  };

  const fmtDate = (iso: string): string => {
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
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        {t('col.title')}
      </p>

      {/* ---- BITS: the balance and its accounting ---- */}
      <div className="rounded-xl border border-solana-green/30 bg-solana-green/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-2xl font-bold text-solana-green">
              ⚡ {bits.current} <span className="text-sm font-normal">BITS</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {t('col.bits.earned', { n: bits.earned })}
            </p>
          </div>
          {bitsHistory.length > 0 && (
            <button
              type="button"
              onClick={() => setLedgerOpen((v) => !v)}
              className="rounded-full border border-solana-green/40 px-3 py-1.5 text-xs text-solana-green transition hover:bg-solana-green/10"
            >
              {ledgerOpen ? t('col.bits.hide') : t('col.bits.show')}
            </button>
          )}
        </div>
        <Link
          to="/rewards"
          className="mt-3 block rounded-lg border border-solana-green/30 px-3 py-2 text-center text-xs font-semibold text-solana-green transition hover:bg-solana-green/10"
        >
          {t('loy.bits.shop')}
        </Link>
        {ledgerOpen && (
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto border-t border-solana-green/15 pt-3">
            {bitsHistory.map((e, i) => (
              <div
                key={`${e.createdAt}-${i}`}
                className="flex items-baseline justify-between gap-3 rounded-lg bg-hero-navy px-3 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate text-slate-300">{reasonLabel(e)}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="text-slate-600">{fmtDate(e.createdAt)}</span>
                  <span
                    className={`font-mono font-semibold ${e.amount >= 0 ? 'text-solana-green' : 'text-red-300'}`}
                  >
                    {e.amount >= 0 ? '+' : ''}
                    {e.amount}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- The collection, as folders ---- */}
      {collectibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-6 text-center">
          <p className="text-sm text-slate-300">{t('col.empty.t')}</p>
          <p className="mt-1 text-xs text-slate-500">{t('col.empty.d')}</p>
        </div>
      ) : (
        grouped
          .filter((f) => f.items.length > 0)
          .map((f, idx) => (
            <details
              key={f.key}
              open={idx === 0}
              className="rounded-xl border border-white/[0.08] bg-hero-navy"
            >
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
                <span className="text-sm font-semibold text-slate-200">
                  {f.icon} {t(f.label)}
                </span>
                <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[11px] text-hero-cyan">
                  {f.items.length}
                </span>
              </summary>
              <motion.div
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.06 } },
                }}
                className="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-3"
              >
                {f.items.map((c) => (
                  <CollectibleCard
                    key={c.assetId}
                    item={c}
                    onOpen={() => setActive(c)}
                    noImageLabel={t('col.noimg')}
                    openLabel={t('col.view')}
                    verifyLabel={t('col.verify.short')}
                  />
                ))}
              </motion.div>
            </details>
          ))
      )}

      <CollectibleModal
        item={active}
        onClose={() => setActive(null)}
        ownerAddress={state.data.wallet}
        onMoved={() => void load()}
      />
    </div>
  );
}

// The tile opens the detail view; the "verify" link beside the id goes
// straight to the public record, one tap, without opening anything first.
// A link cannot live inside a button, so the tile is a div with both.
function CollectibleCard({
  item,
  onOpen,
  noImageLabel,
  openLabel,
  verifyLabel,
}: {
  item: CollectibleSummary;
  onOpen: () => void;
  noImageLabel: string;
  openLabel: string;
  verifyLabel: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
      }}
      whileHover={{ y: -4 }}
      className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-hero-navy transition hover:border-white/30"
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="aspect-square w-full bg-gradient-to-br from-hero-blue/30 via-hero-deep to-hero-deep">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
              {noImageLabel}
            </div>
          )}
        </div>
        <p className="truncate px-3 pt-3 text-sm font-medium text-slate-100">{item.name}</p>
      </button>

      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
        <p className="truncate font-mono text-[10px] text-slate-500">
          {item.assetId.slice(0, 8)}…{item.assetId.slice(-4)}
        </p>
        <a
          href={explorerAddress(item.assetId)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[10px] font-semibold text-hero-gold hover:underline"
        >
          {verifyLabel}
        </a>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-square items-end justify-end p-2 opacity-0 transition group-hover:opacity-100">
        <span className="rounded-full bg-hero-cyan/90 px-2 py-0.5 text-[10px] font-medium text-hero-deep">
          {openLabel}
        </span>
      </div>
    </motion.div>
  );
}
