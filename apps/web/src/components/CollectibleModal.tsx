import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type { CollectibleSummary } from '../lib/api';

interface CollectibleModalProps {
  item: CollectibleSummary | null;
  onClose: () => void;
}

// In-app cNFT detail viewer.
// - Big image, traits, copy/explore/download actions.
// - Esc / outside-click closes.
// - Body scroll locked while open so the page underneath doesn't scroll.
// - Image download uses fetch+blob so it works cross-origin (CDNs that don't
//   send Content-Disposition still produce a valid file).
export default function CollectibleModal({ item, onClose }: CollectibleModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!item) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [item, onClose]);

  if (!item) return null;

  const explorerUrl = `https://explorer.solana.com/address/${item.assetId}?cluster=devnet`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(item.assetId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = async () => {
    if (!item.imageUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(item.imageUrl, { mode: 'cors' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.name.replace(/\s+/g, '-').toLowerCase()}-${item.assetId.slice(0, 6)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // CORS blocked — fall back to opening the image in a new tab.
      window.open(item.imageUrl, '_blank', 'noopener');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-hero-blue/30 bg-hero-deep shadow-2xl"
        >
          {/* Close button */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-hero-blue/40 bg-hero-deep/80 text-slate-300 backdrop-blur transition hover:border-hero-cyan hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          <div className="grid gap-0 md:grid-cols-2">
            {/* Image side */}
            <div className="relative aspect-square w-full bg-gradient-to-br from-hero-blue/20 via-hero-deep to-hero-deep">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-contain p-4 md:p-6"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                  Image not available
                </div>
              )}
            </div>

            {/* Details side */}
            <div className="flex flex-col gap-5 p-6 md:p-7">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-hero-cyan">
                  {item.symbol}
                </p>
                <h3 className="mt-1 font-display text-2xl font-bold tracking-tight">
                  {item.name}
                </h3>
                {item.description && (
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">
                    {item.description}
                  </p>
                )}
              </div>

              {item.attributes.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Traits
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.attributes.map((a) => (
                      <span
                        key={`${a.trait}-${a.value}`}
                        className="rounded-md border border-hero-blue/25 bg-hero-blue/10 px-2.5 py-1 text-xs"
                      >
                        <span className="text-slate-500">{a.trait}: </span>
                        <span className="text-slate-200">{a.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Asset ID
                </p>
                <code className="mt-1 block break-all rounded bg-hero-deep/80 p-2 font-mono text-[11px] text-hero-cyan">
                  {item.assetId}
                </code>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-full border border-hero-blue/40 px-3 py-2 text-xs text-slate-200 transition hover:border-hero-cyan hover:text-white"
                >
                  {copied ? 'Copied!' : 'Copy Asset ID'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!item.imageUrl || downloading}
                  className="rounded-full border border-hero-cyan/40 px-3 py-2 text-xs text-hero-cyan transition hover:border-hero-cyan hover:bg-hero-cyan/10 disabled:opacity-40"
                >
                  {downloading ? 'Saving…' : 'Download image'}
                </button>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="col-span-2 flex items-center justify-center rounded-full bg-hero-gold px-4 py-2 text-xs font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
                >
                  View on Solana Explorer ↗
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
