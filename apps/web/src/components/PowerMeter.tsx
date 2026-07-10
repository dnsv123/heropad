import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// PowerMeter — the "energy bar that fills up" loyalty visual.
// ---------------------------------------------------------------------------
// NOT a punch-card simulation: it's SuperVictor charging up. Each stamp adds a
// segment of energy; the hero's aura brightens as the meter fills; at full power
// it bursts and invites the reward claim. Pure presentational component — it
// takes `current` / `required` and renders. No data fetching, no business logic.

interface PowerMeterProps {
  /** Stamps collected so far. */
  current: number;
  /** Stamps needed for the reward (e.g. 10). */
  required: number;
  /** Optional hero artwork (defaults to the flying SuperVictor). */
  heroSrc?: string;
  /** Just-added a stamp this render — drives the "charge pop" flash. */
  justCharged?: boolean;
}

export default function PowerMeter({
  current,
  required,
  heroSrc = '/super-victor-fly-1.png',
  justCharged = false,
}: PowerMeterProps) {
  const clamped = Math.min(Math.max(current, 0), required);
  const pct = required > 0 ? (clamped / required) * 100 : 0;
  const isFull = clamped >= required && required > 0;

  // Level art: coffee-themed SuperVictor poses, one per progress level.
  // Files live at public/loyalty/levels/level-1.png … level-10.png. Progress is
  // mapped proportionally so venues with required != 10 still work. If a level
  // image is missing we fall back to the default hero — nothing breaks.
  const level =
    required > 0 ? Math.max(1, Math.min(10, Math.ceil((clamped / required) * 10) || 1)) : 1;
  const [imgSrc, setImgSrc] = useState(`/loyalty/levels/level-${level}.png`);
  useEffect(() => {
    setImgSrc(`/loyalty/levels/level-${level}.png`);
  }, [level]);

  // Level gallery — tap the hero to browse all 10 states. Levels above the
  // current progress are locked (dimmed) so there's something to look forward
  // to. Missing artwork falls back to the default hero per-cell.
  const [galleryOpen, setGalleryOpen] = useState(false);

  // Celebration particles — generated once per `required` so they don't jump
  // around on every re-render. (Math.random is fine in app code.)
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 240,
        y: (Math.random() - 0.5) * 200 - 40,
        delay: Math.random() * 0.25,
        color: i % 2 === 0 ? '#F5C842' : '#5DD3FF',
      })),
    []
  );

  return (
    <div className="relative mx-auto w-full max-w-sm select-none">
      {/* ---- Hero with progress-reactive aura ---- */}
      <div className="relative mx-auto aspect-square w-44 sm:w-52">
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(93,211,255,0.40), rgba(245,200,66,0.18), transparent 70%)',
            filter: 'blur(22px)',
          }}
          animate={{
            opacity: 0.25 + (pct / 100) * 0.75,
            scale: 1 + (pct / 100) * 0.18,
          }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
        <motion.img
          src={imgSrc}
          alt="SuperVictor charging up — tap to see all levels"
          role="button"
          tabIndex={0}
          onClick={() => setGalleryOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setGalleryOpen(true);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer object-contain drop-shadow-[0_8px_24px_rgba(93,211,255,0.25)]"
          animate={isFull ? { y: [0, -14, 0], rotate: [0, -2, 2, 0] } : { y: [0, -7, 0] }}
          transition={{ duration: isFull ? 1.1 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
          onError={(e) => {
            // Level image missing → fall back to the default hero once; if even
            // that fails (offline), hide the img and keep the aura.
            const el = e.target as HTMLImageElement;
            if (el.src.includes('/loyalty/levels/')) {
              setImgSrc(heroSrc);
            } else {
              el.style.display = 'none';
            }
          }}
        />

        {/* Burst when full power is reached. */}
        <AnimatePresence>
          {isFull && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {particles.map((p) => (
                <motion.span
                  key={p.id}
                  className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                  animate={{ opacity: [0, 1, 0], x: p.x, y: p.y, scale: [0.4, 1.2, 0.6] }}
                  transition={{ duration: 1.1, delay: p.delay, ease: 'easeOut' }}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ---- Counter ---- */}
      <div className="mt-4 text-center">
        <motion.span
          key={clamped}
          initial={{ scale: justCharged ? 1.5 : 1, color: justCharged ? '#FFDB6E' : '#5DD3FF' }}
          animate={{ scale: 1, color: '#5DD3FF' }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="font-display text-5xl font-bold"
        >
          {clamped}
        </motion.span>
        <span className="ml-1 font-display text-2xl font-semibold text-slate-500">
          / {required}
        </span>
      </div>

      {/* ---- Energy bar ---- */}
      <div className="relative mt-4 h-7 w-full overflow-hidden rounded-full border border-hero-blue/30 bg-hero-deep/80">
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ background: 'linear-gradient(90deg, #5DD3FF 0%, #3B9DDC 45%, #F5C842 100%)' }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 110, damping: 18 }}
        >
          {/* Moving shimmer along the filled part. */}
          <motion.span
            aria-hidden
            className="absolute inset-y-0 w-10 -skew-x-12 bg-white/30"
            animate={{ left: ['-15%', '115%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        {/* Segment dividers — one notch per stamp. */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: required }, (_, i) => (
            <div key={i} className="flex-1 border-r border-hero-deep/70 last:border-r-0" />
          ))}
        </div>
      </div>

      {/* ---- Status line ---- */}
      <div className="mt-3 text-center text-sm">
        {isFull ? (
          <span className="font-semibold text-hero-gold">⚡ Full power — reward unlocked!</span>
        ) : (
          <span className="text-slate-400">
            {required - clamped} more {required - clamped === 1 ? 'stamp' : 'stamps'} to your reward
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setGalleryOpen(true)}
        className="mx-auto mt-2 block text-xs text-slate-500 underline decoration-dotted transition hover:text-hero-cyan"
      >
        See all power levels
      </button>

      {/* ---- Level gallery modal ---- */}
      <AnimatePresence>
        {galleryOpen && (
          <motion.div
            key="level-gallery-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setGalleryOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-hero-blue/30 bg-hero-deep p-5 shadow-2xl"
            >
              <h3 className="text-center font-display text-lg font-semibold text-hero-cyan">
                SuperVictor power levels
              </h3>
              <p className="mt-1 text-center text-xs text-slate-500">
                Every stamp charges him up — you are at level {level}.
              </p>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((lv) => {
                  const unlocked = lv <= level;
                  return (
                    <div
                      key={lv}
                      className={`relative aspect-square overflow-hidden rounded-xl border p-1 ${
                        lv === level
                          ? 'border-hero-gold bg-hero-gold/10'
                          : 'border-hero-blue/20 bg-hero-deep/60'
                      }`}
                    >
                      <img
                        src={`/loyalty/levels/level-${lv}.png`}
                        alt={`Level ${lv}`}
                        loading="lazy"
                        className={`h-full w-full object-contain ${
                          unlocked ? '' : 'opacity-25 grayscale'
                        }`}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = heroSrc;
                        }}
                      />
                      {!unlocked && (
                        <span className="absolute inset-0 flex items-center justify-center text-base">
                          🔒
                        </span>
                      )}
                      <span className="absolute bottom-0.5 right-1 text-[9px] font-semibold text-slate-400">
                        {lv}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setGalleryOpen(false)}
                className="mt-5 w-full rounded-full bg-hero-gold px-4 py-2 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
              >
                Keep charging ⚡
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
