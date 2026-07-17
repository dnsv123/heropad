import { motion } from 'framer-motion';

import { useT } from '../i18n';

// Landing → "How Power Pass works": the customer journey in 4 steps.
// Bilingual via i18n; cards reveal on scroll.
export default function HowItWorks() {
  const { t } = useT();

  const steps = [
    { icon: '📱', title: t('how.s1.t'), text: t('how.s1.d') },
    { icon: '⚡', title: t('how.s2.t'), text: t('how.s2.d') },
    { icon: '🎁', title: t('how.s3.t'), text: t('how.s3.d') },
    { icon: '🏆', title: t('how.s4.t'), text: t('how.s4.d') },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
        {t('how.title')}
      </h2>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: i * 0.08 }}
            className="rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-5 transition hover:border-hero-cyan/40"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{s.icon}</span>
              <span className="font-display text-sm font-bold uppercase tracking-wider text-hero-cyan">
                {i + 1}. {s.title}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{s.text}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
