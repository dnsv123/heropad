import { useState } from 'react';
import { motion } from 'framer-motion';

import { useT, type TranslationKey } from '../i18n';

// Landing → "see the product": real phone screenshots fanned as a stacked
// carousel. Built natively on framer-motion (already in the bundle) — a
// library carousel would cost hundreds of KB for what is, mechanically,
// five transforms and a drag threshold. Everything below the fold, images
// lazy: the section costs the landing's LCP nothing.

const SHOTS: Array<{ file: string; label: TranslationKey }> = [
  { file: 'pasaport', label: 'pc.i1' },
  { file: 'tejghea', label: 'pc.i2' },
  { file: 'cardul-clientului', label: 'pc.i3' },
  { file: 'trofee', label: 'pc.i4' },
  { file: 'happy-hour', label: 'pc.i5' },
];

export default function ProductCarousel() {
  const { t } = useT();
  const [active, setActive] = useState(2); // the customer card leads

  const step = (dir: 1 | -1) =>
    setActive((a) => Math.min(SHOTS.length - 1, Math.max(0, a + dir)));

  return (
    <section className="relative overflow-hidden px-6 py-12 md:py-16">
      <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
        {t('pc.title')}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400 md:text-base">
        {t('pc.sub')}
      </p>

      {/* The stage. Drag anywhere (or tap a side card) to change focus. */}
      <motion.div
        className="relative mx-auto mt-8 h-[400px] max-w-4xl cursor-grab active:cursor-grabbing md:h-[460px]"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60) step(1);
          else if (info.offset.x > 60) step(-1);
        }}
      >
        {SHOTS.map((s, i) => {
          const off = i - active;
          if (Math.abs(off) > 2) return null;
          return (
            <motion.button
              key={s.file}
              type="button"
              aria-label={t(s.label)}
              onClick={() => setActive(i)}
              animate={{
                x: `calc(-50% + ${off * 46}%)`,
                rotate: off * 5,
                scale: 1 - Math.abs(off) * 0.09,
                opacity: 1 - Math.abs(off) * 0.18,
                zIndex: 10 - Math.abs(off),
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className="absolute left-1/2 top-0 h-[360px] w-[170px] overflow-hidden rounded-[24px] border-2 bg-hero-deep md:h-[420px] md:w-[200px]"
              style={{ borderColor: off === 0 ? 'rgba(245,200,66,.7)' : 'rgba(255,255,255,.12)' }}
            >
              <img
                src={`/landing/${s.file}.webp`}
                alt={t(s.label)}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover object-top"
                draggable={false}
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-hero-deep/95 to-transparent px-2 pb-2 pt-6 text-center text-[11px] font-semibold text-white">
                {t(s.label)}
              </span>
            </motion.button>
          );
        })}
      </motion.div>

      <p className="mt-3 text-center text-xs text-slate-500">{t('pc.hint')}</p>
      <div className="mt-2 flex justify-center gap-1.5">
        {SHOTS.map((s, i) => (
          <button
            key={s.file}
            type="button"
            aria-label={t(s.label)}
            onClick={() => setActive(i)}
            className={`h-2 w-2 rounded-full transition ${
              i === active ? 'bg-hero-gold' : 'bg-white/20 hover:bg-white/40'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
