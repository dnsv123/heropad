import { motion } from 'framer-motion';

import { useT } from '../i18n';
import { chainContactHref, contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing → public pricing. We tell café owners "competitors hide their price
// behind Let's-talk; we publish ours" — so the site has to actually publish
// it. Unlimited customers on every plan is the structural differentiator and
// it is said here, not implied.
export default function LandingPricing() {
  const { t } = useT();

  const tiers = [
    { name: 'Starter', price: '99', feats: t('lp.s.feats'), hl: false },
    { name: 'Branded', price: '199', feats: t('lp.b.feats'), hl: true },
    { name: 'Growth', price: '349', feats: t('lp.g.feats'), hl: false },
  ];

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-12 md:py-16">
      <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
        {t('lp.title')}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400 md:text-base">
        {t('lp.sub')}
      </p>

      <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-hero-gold/50 bg-hero-gold/10 px-5 py-3.5 text-center text-sm text-hero-gold">
        ⭐ {t('lp.founding')}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {tiers.map((tier, i) => (
          <motion.div
            key={tier.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            className={`rounded-2xl border bg-hero-deep/50 p-6 ${
              tier.hl ? 'border-hero-gold/60' : 'border-hero-blue/20'
            }`}
          >
            <p className={`font-display font-semibold ${tier.hl ? 'text-hero-gold' : 'text-hero-cyan'}`}>
              {tier.name}
            </p>
            <p className="mt-1 font-display text-3xl font-bold text-white">
              {tier.price} <span className="text-base font-normal text-slate-400">{t('lp.mo')}</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{tier.feats}</p>
          </motion.div>
        ))}
      </div>

      <p className="mt-4 text-center text-sm text-slate-400">
        {t('lp.chain')}{' '}
        <a
          href={chainContactHref()}
          target={contactIsWhatsApp() ? '_blank' : undefined}
          rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
          className="text-hero-cyan underline transition hover:text-hero-gold"
        >
          {t('lp.chain.cta')}
        </a>
      </p>
      <p className="mt-2 text-center text-xs text-slate-500">{t('lp.note')}</p>
      <div className="mt-5 text-center">
        <a
          href={contactHref()}
          target={contactIsWhatsApp() ? '_blank' : undefined}
          rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
          className="rounded-full bg-hero-gold px-8 py-3 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
        >
          {t('biz.cta')}
        </a>
      </div>
    </section>
  );
}
