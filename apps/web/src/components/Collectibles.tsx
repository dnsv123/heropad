import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

import { getUserMe, type CollectibleSummary, type UserMeResponse } from '../lib/api';
import CollectibleModal from './CollectibleModal';

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
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'data'; data: UserMeResponse }
    | { phase: 'error'; message: string }
  >({ phase: 'loading' });
  const [active, setActive] = useState<CollectibleSummary | null>(null);

  const load = async () => {
    setState({ phase: 'loading' });
    try {
      const data = await getUserMe(walletAddress);
      setState({ phase: 'data', data });
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Could not load profile data.',
      });
    }
  };

  useEffect(() => {
    if (!walletAddress) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  // ---- Loading -----------------------------------------------------------
  if (state.phase === 'loading') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Your collection
          </p>
          <div className="h-6 w-24 animate-pulse rounded-full bg-hero-blue/20" />
        </div>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-xl border border-hero-blue/15 bg-hero-deep/60"
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
        <p>Could not load your collection — {state.message}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 rounded-full border border-red-300/40 px-3 py-1 text-xs hover:border-red-300"
        >
          Retry
        </button>
      </div>
    );
  }

  // ---- Data --------------------------------------------------------------
  const { bits, collectibles } = state.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Your collection
        </p>
        <div className="flex items-center gap-2 rounded-full border border-solana-green/40 bg-solana-green/5 px-3 py-1 text-xs">
          <span className="font-mono text-solana-green">{bits.earned}</span>
          <span className="text-slate-400">BITS earned</span>
        </div>
      </div>

      {collectibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hero-blue/30 p-6 text-center">
          <p className="text-sm text-slate-300">No collectibles yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Scan a figurine, card, or pack to claim your first cNFT.
          </p>
          <a
            href="/claim"
            className="mt-4 inline-block rounded-full bg-hero-gold px-5 py-2 text-xs font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
          >
            Go to Claim →
          </a>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08 } },
          }}
          className="grid gap-3 grid-cols-2 md:grid-cols-3"
        >
          {collectibles.map((c) => (
            <CollectibleCard
              key={c.assetId}
              item={c}
              onOpen={() => setActive(c)}
            />
          ))}
        </motion.div>
      )}

      <CollectibleModal item={active} onClose={() => setActive(null)} />
    </div>
  );
}

function CollectibleCard({
  item,
  onOpen,
}: {
  item: CollectibleSummary;
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
      }}
      whileHover={{ y: -4 }}
      className="group relative block w-full overflow-hidden rounded-xl border border-hero-blue/20 bg-hero-deep/60 text-left transition hover:border-hero-cyan"
    >
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
            (no image)
          </div>
        )}
      </div>

      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium text-slate-100">
          {item.name}
        </p>
        <p className="truncate font-mono text-[10px] text-slate-500">
          {item.assetId.slice(0, 8)}…{item.assetId.slice(-4)}
        </p>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-2 opacity-0 transition group-hover:opacity-100">
        <span className="rounded-full bg-hero-cyan/90 px-2 py-0.5 text-[10px] font-medium text-hero-deep">
          View ↗
        </span>
      </div>
    </motion.button>
  );
}
