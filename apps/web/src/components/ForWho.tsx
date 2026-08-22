import { motion } from 'framer-motion';

import { useT } from '../i18n';

// Landing → who it fits. The mechanics are identical everywhere; only the
// emoji, the threshold and the reward change — which is exactly the message.
export default function ForWho() {
  const { t } = useT();

  // The mascot in each vertical's pose — Valentin's commissioned art, 320px
  // transparent WebPs (~24KB each, lazy, below the fold). This grid is the
  // thing no competitor can copy.
  const verticals: Array<[string, string]> = [
    ['cafenea', t('fw.v1')],
    ['gelaterie', t('fw.v2')],
    ['cofetarie', t('fw.v3')],
    ['brutarie', t('fw.v4')],
    ['pizzerie', t('fw.v5')],
    ['frizerie', t('fw.v6')],
    ['salon', t('fw.v7')],
    ['fitness', t('fw.v8')],
    ['food-truck', t('fw.v9')],
    ['librarie-cafenea', t('fw.v10')],
    ['ceainarie', t('fw.v11')],
    ['petshop', t('fw.v12')],
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
        {t('fw.title')}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400 md:text-base">
        {t('fw.sub')}
      </p>
      <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {verticals.map(([img, label], i) => (
          <motion.div
            key={img}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: (i % 6) * 0.05 }}
            className="rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-3 text-center transition hover:border-hero-cyan/40"
          >
            <img
              src={`/venues/${img}.webp`}
              alt={label}
              width={320}
              height={320}
              loading="lazy"
              decoding="async"
              className="mx-auto aspect-square w-full max-w-[120px] object-contain"
            />
            <span className="mt-1.5 block text-[13px] text-slate-300">{label}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">{t('fw.more')}</p>
    </section>
  );
}
