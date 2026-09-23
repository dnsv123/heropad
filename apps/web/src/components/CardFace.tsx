import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useT } from '../i18n';
import LogoMark from './LogoMark';
import { readableOnNavy } from '../lib/color';

// The loyalty card as an object: what a customer holds, not a progress bar.
// ---------------------------------------------------------------------------
// A wallet-style card in the logo's navy, with a fine engraved pattern (the
// way banknotes and good cards feel premium without shouting), the venue's
// name and logo, SuperVictor in the pose of the customer's current level,
// the count in big numerals, a segmented bar that fills in amber, the reward
// at the foot and the customer's code where a card number would be.
//
// "Playful premium": it tilts toward the finger and a light sheen follows it;
// a new stamp pops the number and sweeps the sheen; a full card turns gold at
// the edge and throws a small burst. Everything respects reduced motion.
//
// Pure presentation: numbers in, card out. Used large on the customer's page
// and compact on the barista's counter, so both see the same card.

export interface CardFaceProps {
  venueName: string;
  logo?: string | null;
  /** Venue accent (#RRGGBB); tints the bar and the small labels. */
  accent?: string | null;
  current: number;
  required: number;
  rewardLabel?: string | null;
  /** The customer's code, shown like a card number; hidden when absent. */
  code?: string | null;
  justCharged?: boolean;
  size?: 'lg' | 'md';
  /** Milestone thresholds, marked on the bar. */
  milestones?: number[];
}

const AMBER = '#F7A30C';

function levelFor(current: number, required: number): number {
  if (required <= 0) return 1;
  return Math.max(1, Math.min(10, Math.ceil((Math.min(current, required) / required) * 10) || 1));
}

export default function CardFace({
  venueName,
  logo,
  accent,
  current,
  required,
  rewardLabel,
  code,
  justCharged = false,
  size = 'lg',
  milestones = [],
}: CardFaceProps) {
  const { t } = useT();
  const clamped = Math.min(Math.max(current, 0), required);
  const full = required > 0 && clamped >= required;
  const left = Math.max(0, required - clamped);
  const oneLeft = !full && left === 1;
  const lg = size === 'lg';
  const tint = accent ?? AMBER;

  const level = levelFor(clamped, required);
  const [art, setArt] = useState(`/loyalty/levels/level-${level}.webp`);
  useEffect(() => setArt(`/loyalty/levels/level-${level}.webp`), [level]);

  // Tilt + sheen follow the pointer. Off for reduced motion and on the
  // compact counter card (the barista's thumb is busy).
  const ref = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 70, my: 20 });
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!lg || reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ rx: (0.5 - py) * 7, ry: (px - 0.5) * 9, mx: px * 100, my: py * 100 });
  };
  const onLeave = () => setTilt({ rx: 0, ry: 0, mx: 70, my: 20 });

  const burst = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return { id: i, x: Math.cos(a) * (70 + (i % 3) * 18), y: Math.sin(a) * (54 + (i % 4) * 12), c: i % 2 ? AMBER : '#FFFFFF' };
      }),
    []
  );

  const style: CSSProperties = {
    transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
    transition: 'transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1)',
    background:
      // light that follows the finger, a fine engraved lattice, the navy body
      `radial-gradient(120% 90% at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.16), transparent 45%),` +
      'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px),' +
      'repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 9px),' +
      // the venue's own colour, a soft light from the logo's corner
      (accent ? `radial-gradient(90% 70% at 0% 0%, ${accent}55, transparent 60%),` : '') +
      'linear-gradient(145deg, #14357F 0%, #0A2766 42%, #061A47 100%)',
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={style}
      className={`relative isolate w-full overflow-hidden text-white ${
        lg ? 'rounded-[28px] p-5 sm:p-6' : 'rounded-3xl p-4'
      } ${full ? 'ring-2 ring-[#F7A30C] ring-offset-0' : 'ring-1 ring-white/10'} shadow-[0_30px_60px_-28px_rgba(3,10,35,0.8)]`}
    >
      {/* Gold sheen that sweeps once when a stamp lands. */}
      <AnimatePresence>
        {justCharged && (
          <motion.span
            key="sweep"
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 z-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
            initial={{ x: '0%' }}
            animate={{ x: '420%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* A branded venue signs the card with its colour along the top edge. */}
      {accent && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, ${accent}, ${accent}00 85%)` }}
        />
      )}

      {/* Top row: the venue, and whose card it is. */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {logo ? (
            <LogoMark src={logo} height={lg ? 34 : 26} maxWidth={lg ? 120 : 92} />
          ) : (
            <img src="/super-victor-face.webp" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full ring-1 ring-white/20" />
          )}
          <p className={`truncate font-display font-semibold ${lg ? 'text-base sm:text-lg' : 'text-sm'}`}>{venueName}</p>
        </div>
        <p className="shrink-0 font-display text-xs font-bold tracking-tight text-white/70">
          Hero<span style={{ color: AMBER }}>Pad</span>
        </p>
      </div>

      {/* Middle: the count, and the hero at this level. */}
      <div className={`relative z-10 grid items-end ${lg ? 'mt-3 grid-cols-[minmax(0,1fr)_132px] sm:grid-cols-[minmax(0,1fr)_160px]' : 'mt-2 grid-cols-[minmax(0,1fr)_84px]'}`}>
        <div className="min-w-0 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: accent ? readableOnNavy(accent) : AMBER }}>
            {t('cf.stamps')}
          </p>
          <p className="mt-1 flex items-baseline gap-1 font-display font-bold leading-none">
            <motion.span
              key={clamped}
              initial={justCharged ? { scale: 1.35, color: AMBER } : false}
              animate={{ scale: 1, color: '#FFFFFF' }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className={`inline-block origin-bottom-left ${lg ? 'text-6xl sm:text-7xl' : 'text-4xl'}`}
            >
              {clamped}
            </motion.span>
            <span className={`text-white/45 ${lg ? 'text-2xl' : 'text-lg'}`}>/{required}</span>
          </p>
          <motion.p
            className={`mt-2 font-medium ${lg ? 'text-sm' : 'text-xs'} ${full || oneLeft ? '' : 'text-white/70'}`}
            style={full || oneLeft ? { color: AMBER } : undefined}
            animate={oneLeft && !reduced ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
            transition={oneLeft ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
          >
            {full ? t('cf.full') : oneLeft ? t('cf.one') : t('cf.left', { n: left })}
          </motion.p>
        </div>
        <div className="relative -mb-1 -mr-1 aspect-square">
          <motion.img
            src={art}
            alt={t('meter.alt')}
            width={512}
            height={512}
            className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
            animate={reduced ? undefined : full ? { y: [0, -8, 0], rotate: [0, -2, 2, 0] } : { y: [0, -4, 0] }}
            transition={{ duration: full ? 1.2 : 3.4, repeat: Infinity, ease: 'easeInOut' }}
            onError={() => setArt('/super-victor-fly-1.webp')}
          />
          <AnimatePresence>
            {full && !reduced && (
              <span aria-hidden className="pointer-events-none absolute inset-0">
                {burst.map((p) => (
                  <motion.span
                    key={p.id}
                    className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: p.c }}
                    initial={{ opacity: 0, x: 0, y: 0 }}
                    animate={{ opacity: [0, 1, 0], x: p.x, y: p.y }}
                    transition={{ duration: 1.2, delay: (p.id % 5) * 0.05, repeat: Infinity, repeatDelay: 2.4 }}
                  />
                ))}
              </span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* The bar: one segment per stamp, milestones marked. */}
      <div className={`relative z-10 flex gap-[3px] ${lg ? 'mt-3 h-2.5' : 'mt-2 h-2'}`} aria-hidden>
        {Array.from({ length: required }, (_, i) => {
          const on = i < clamped;
          const ms = milestones.includes(i + 1);
          return (
            <span
              key={i}
              className="relative flex-1 overflow-hidden rounded-full bg-white/[0.12]"
            >
              <span
                className="absolute inset-0 rounded-full transition-[transform] duration-500"
                style={{ background: tint, transform: `scaleX(${on ? 1 : 0})`, transformOrigin: 'left' }}
              />
              {ms && <span className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white" />}
            </span>
          );
        })}
      </div>

      {/* Foot: the promise, and the card number. */}
      <div className={`relative z-10 flex items-center justify-between gap-3 ${lg ? 'mt-4' : 'mt-3'}`}>
        {rewardLabel ? (
          <p className={`min-w-0 truncate ${lg ? 'text-sm' : 'text-xs'}`}>
            <span className="text-white/60">{t('cf.at', { n: required })} </span>
            <span className="font-semibold text-white">{rewardLabel}</span>
          </p>
        ) : (
          <span />
        )}
        <p className={`shrink-0 font-mono tracking-[0.22em] text-white/75 ${lg ? 'text-sm' : 'text-xs'}`}>
          {code ?? '••••••'}
        </p>
      </div>
    </div>
  );
}
