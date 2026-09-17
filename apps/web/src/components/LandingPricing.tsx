import { useT } from '../i18n';
import { chainContactHref, contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing → public pricing. We tell café owners "competitors hide their price
// behind Let's-talk; we publish ours" — so the site has to actually publish
// it. Unlimited customers on every plan is the structural differentiator and
// it is said here, not implied.
//
// Four plans, four columns, features one under the other. The Founding
// Partner offer is NOT on the public site: it is the pitch for the first ten
// cafés, made in person, and Admin's plan picker carries it.
export default function LandingPricing() {
  const { t } = useT();

  const tiers = [
    { name: 'Starter', price: '99', feats: t('lp.s.feats'), hl: false, chain: false },
    { name: 'Branded', price: '199', feats: t('lp.b.feats'), hl: true, chain: false },
    { name: 'Growth', price: '349', feats: t('lp.g.feats'), hl: false, chain: false },
    { name: 'Chain', price: t('lp.c.price'), feats: t('lp.c.feats'), hl: false, chain: true },
  ];

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-12 md:py-16">
      <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
        {t('lp.title')}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400 md:text-base">
        {t('lp.sub')}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`card relative flex flex-col p-6 ${tier.hl ? 'border-hero-gold/60' : ''}`}
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

            <ul className="mt-5 flex-1 space-y-2.5">
              {tier.feats.split(' · ').map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm leading-snug text-slate-300">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-hero-gold" aria-hidden>
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            {tier.chain && (
              <a
                href={chainContactHref()}
                target={contactIsWhatsApp() ? '_blank' : undefined}
                rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
                className="btn btn-secondary btn-sm mt-6"
              >
                {t('lp.c.cta')}
              </a>
            )}
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-slate-500">{t('lp.note')}</p>
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
