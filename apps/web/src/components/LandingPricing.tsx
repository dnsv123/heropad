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

      <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-hero-gold/40 bg-hero-gold/10 px-5 py-3.5 text-center text-sm text-hero-gold">
        ⭐ {t('lp.founding')}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`card relative p-6 ${tier.hl ? 'border-hero-gold/60' : ''}`}
          >
            {tier.hl && (
              <span className="chip chip-gold absolute -top-3 left-6 py-1 text-[11px]">
                {t('lp.hl')}
              </span>
            )}
            <p className="font-display font-semibold text-slate-300">{tier.name}</p>
            <p className="tnum mt-2 font-display text-4xl font-bold leading-none text-white">
              {tier.price}
              <span className="ml-1.5 text-base font-normal text-slate-500">{t('lp.mo')}</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">{tier.feats}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-sm text-slate-400">
        {t('lp.chain')}{' '}
        <a
          href={chainContactHref()}
          target={contactIsWhatsApp() ? '_blank' : undefined}
          rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
          className="text-white underline decoration-white/30 underline-offset-4 transition hover:decoration-white"
        >
          {t('lp.chain.cta')}
        </a>
      </p>
      <p className="mt-2 text-center text-xs text-slate-500">{t('lp.note')}</p>
      <div className="mt-6 text-center">
        <a
          href={contactHref()}
          target={contactIsWhatsApp() ? '_blank' : undefined}
          rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
          className="btn btn-primary"
        >
          {t('biz.cta')}
        </a>
      </div>
    </section>
  );
}
