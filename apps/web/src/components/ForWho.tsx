import { motion } from 'framer-motion';

import { useT } from '../i18n';

// Landing → who it fits. The mechanics are identical everywhere; only the
// emoji, the threshold and the reward change — which is exactly the message.
export default function ForWho() {
  const { t } = useT();

  const verticals = [
    ['☕', t('fw.v1')],
    ['🍦', t('fw.v2')],
    ['🍰', t('fw.v3')],
    ['🥖', t('fw.v4')],
    ['🍕', t('fw.v5')],
    ['💈', t('fw.v6')],
    ['💅', t('fw.v7')],
    ['🏋️', t('fw.v8')],
    ['🚚', t('fw.v9')],
    ['📚', t('fw.v10')],
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
        {t('fw.title')}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400 md:text-base">
        {t('fw.sub')}
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {verticals.map(([icon, label], i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: i * 0.04 }}
            className="rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-4 text-center"
          >
            <span className="block text-3xl leading-none">{icon}</span>
            <span className="mt-2 block text-sm text-slate-300">{label}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">{t('fw.more')}</p>
    </section>
  );
}
