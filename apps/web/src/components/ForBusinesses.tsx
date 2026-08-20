import { motion } from 'framer-motion';

import { useT } from '../i18n';

// Landing → "#business": the merchant-facing pitch section. This is where the
// hero's primary CTA lands. Benefits + pilot offer + a mailto CTA (a proper
// contact form comes with the merchant self-service phase).
export default function ForBusinesses() {
  const { t } = useT();

  const benefits = [
    { icon: '🔁', tint: 'bg-hero-cyan/15', title: t('biz.b1.t'), text: t('biz.b1.d') },
    { icon: '📊', tint: 'bg-hero-cyan/15', title: t('biz.b2.t'), text: t('biz.b2.d') },
    { icon: '🛡️', tint: 'bg-hero-gold/15', title: t('biz.b3.t'), text: t('biz.b3.d') },
    { icon: '🔒', tint: 'bg-hero-gold/15', title: t('biz.b4.t'), text: t('biz.b4.d') },
  ];

  return (
    <section id="business" className="relative scroll-mt-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />
      <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
          {t('biz.title')}
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400 md:text-base">
          {t('biz.sub')}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {benefits.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="flex items-start gap-4 rounded-2xl border border-hero-blue/15 bg-hero-deep/50 p-5"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${b.tint}`}
              >
                {b.icon}
              </span>
              <span>
                <p className="font-display font-semibold text-white">{b.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{b.text}</p>
              </span>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="rounded-full border border-solana-green/40 bg-solana-green/10 px-5 py-2 text-sm font-semibold text-solana-green">
            {t('biz.pricing')}
          </p>
          <a
            href="mailto:dinescuioanvalentin@gmail.com?subject=HeroPad%20Power%20Pass%20—%20Demo"
            className="rounded-full bg-hero-gold px-8 py-3 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
          >
            {t('biz.cta')}
          </a>
        </div>
      </div>
    </section>
  );
}
