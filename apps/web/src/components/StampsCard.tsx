import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { getItem, setItem } from '../services/storageService';
import { useT } from '../i18n';

// The classic stamp card, in HeroPad language. A grid of circles sized by the
// venue's own threshold — and each circle carries a DIFFERENT power-level
// artwork, mapped proportionally onto the 1..10 set: a 5-stamp venue unlocks
// levels 2·4·6·8·10, a 10-stamp one all ten. Earned = full colour with a gold
// glow; unearned = the same art greyed — you can SEE what the next visit
// unlocks. That turns the card into a small collection, not a repeated icon
// (Valentin's call, replacing the cropped-head badge). Last cell = FREE.
//
// The landing animation: when a fresh stamp arrives, the badge appears BIG in
// the middle of the card, then flies into its circle and settles. The flight
// target is measured from the real DOM (refs), so it lands exactly — on any
// screen size, any threshold.
//
// Collapsible and remembered: visible by default (the experience IS the
// point), one tap hides it for the people who only want the meter.

interface StampsCardProps {
  stamps: number;
  required: number;
  canRedeem: boolean;
  /** Index (0-based) of a stamp that JUST arrived — triggers the flight. */
  newStamp: number | null;
  onFlightDone: () => void;
}

/** Which of the 10 level artworks stamp #i (0-based) shows, for any threshold. */
function levelArt(i: number, required: number): string {
  const lv = Math.min(10, Math.max(1, Math.round(((i + 1) / required) * 10)));
  return `/loyalty/levels/thumb-${lv}.webp`;
}

export default function StampsCard({
  stamps,
  required,
  canRedeem,
  newStamp,
  onFlightDone,
}: StampsCardProps) {
  const { t } = useT();
  const [hidden, setHidden] = useState(false);
  const [flight, setFlight] = useState<{ index: number; dx: number; dy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    void getItem<boolean>('hideStamps').then((v) => {
      if (v === true) setHidden(true);
    });
  }, []);

  // Measure where the new stamp's circle sits and launch the flight there.
  useEffect(() => {
    if (newStamp === null || hidden) return;
    const frame = requestAnimationFrame(() => {
      const box = boxRef.current?.getBoundingClientRect();
      const cell = cellRefs.current[newStamp]?.getBoundingClientRect();
      if (!box || !cell) {
        onFlightDone();
        return;
      }
      setFlight({
        index: newStamp,
        dx: cell.left + cell.width / 2 - (box.left + box.width / 2),
        dy: cell.top + cell.height / 2 - (box.top + box.height / 2),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [newStamp, hidden, onFlightDone]);

  const toggle = () => {
    setHidden((v) => {
      void setItem('hideStamps', !v);
      return !v;
    });
  };

  const clamped = Math.min(stamps, required);
  const cells = required + 1; // + the FREE reward cell

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-hero-gold">
          {t('st.title')} · {clamped}/{required}
        </p>
        <button
          type="button"
          onClick={toggle}
          className="text-[11px] text-slate-500 underline transition hover:text-hero-cyan"
        >
          {hidden ? t('st.show') : t('st.hide')}
        </button>
      </div>

      {!hidden && (
        <div
          ref={boxRef}
          className="relative mt-2 rounded-2xl border border-hero-gold/30 bg-gradient-to-br from-hero-gold/[0.06] to-hero-deep/60 p-3"
        >
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.min(cells, 5)}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cells }, (_, i) => {
              const isFree = i === required;
              const earned = i < clamped;
              const isNext = i === clamped && !isFree;
              const inFlight = flight?.index === i;
              return (
                <div
                  key={i}
                  ref={(el) => {
                    cellRefs.current[i] = el;
                  }}
                  className={`relative mx-auto flex aspect-square w-full max-w-[56px] items-center justify-center overflow-hidden rounded-full border-2 ${
                    isFree
                      ? canRedeem
                        ? 'animate-pulse border-solana-green bg-solana-green/15'
                        : 'border-solana-green/50 bg-solana-green/5'
                      : earned
                        ? 'border-hero-gold bg-hero-deep shadow-[0_0_10px_rgba(245,200,66,0.35)]'
                        : isNext
                          ? 'border-dashed border-hero-gold/60 bg-hero-deep/70'
                          : 'border-slate-600/40 bg-hero-deep/70'
                  }`}
                >
                  {isFree ? (
                    <span className="text-[11px] font-extrabold tracking-wide text-solana-green">
                      FREE
                    </span>
                  ) : (
                    <img
                      src={levelArt(i, required)}
                      alt=""
                      width={56}
                      height={56}
                      draggable={false}
                      className={`h-full w-full object-cover transition duration-500 ${
                        earned && !inFlight
                          ? ''
                          : earned && inFlight
                            ? 'opacity-0'
                            : 'opacity-30 grayscale'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* The flight: big in the centre, then into its circle. */}
          <AnimatePresence>
            {flight && (
              <motion.img
                key={`fly-${flight.index}`}
                src={levelArt(flight.index, required)}
                alt=""
                initial={{ x: 0, y: 0, scale: 2.4, opacity: 0 }}
                animate={{
                  opacity: [0, 1, 1, 1],
                  scale: [2.4, 2.4, 2.4, 0.42],
                  x: [0, 0, 0, flight.dx],
                  y: [0, 0, 0, flight.dy],
                }}
                transition={{ duration: 1.15, times: [0, 0.2, 0.55, 1], ease: 'easeInOut' }}
                onAnimationComplete={() => {
                  setFlight(null);
                  onFlightDone();
                }}
                className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-hero-gold object-cover shadow-[0_0_24px_rgba(245,200,66,0.6)]"
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
