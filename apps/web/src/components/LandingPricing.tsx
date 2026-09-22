import { useState } from 'react';

import { useT } from '../i18n';
import { annualPrice } from '../lib/plans';
import { chainContactHref, contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing → public pricing, paper face. We tell café owners "competitors hide
// their price behind Let's-talk; we publish ours" — so the site has to
// actually publish it. Unlimited customers on every plan is the structural
// differentiator and it is said here, not implied.
//
// Monthly / annual: one segmented control above the cards, annual selected
// by default. Annual is "ten months paid, twelve served" and is said as
// "2 months free". The Founding Partner offer is NOT on the public site.
export default function LandingPricing() {
  const { t } = useT();
  const [annual, setAnnual] = useState(true);

  const tiers = [
    { name: 'Starter', monthly: 99, feats: t('lp.s.feats'), hl: false, chain: false },
    { name: 'Branded', monthly: 199, feats: t('lp.b.feats'), hl: true, chain: false },
    { name: 'Growth', monthly: 349, feats: t('lp.g.feats'), hl: false, chain: false },
    { name: 'Chain', monthly: 699, feats: t('lp.c.feats'), hl: false, chain: true },
  ];

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-14 sm:px-6 md:py-20">
      <div className="mx-auto max-w-[60ch] text-center">
        <p className="eyebrow-brass">{t('nav.pricing')}</p>
        <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-4xl">
          {t('lp.title')}
        </h2>
        <p className="mt-3 text-base text-ink-2">{t('lp.sub')}</p>
      </div>

      <div className="mt-7 flex justify-center">
        <div className="inline-flex max-w-full rounded-full border border-ink/15 bg-paper-2 p-1">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
              !annual ? 'bg-hero-deep text-white' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {t('lp.toggle.monthly')}
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
              annual ? 'bg-hero-deep text-white' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {t('lp.toggle.annual')}
            <span className="rounded-full bg-brass-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-hero-deep">
              {t('lp.toggle.free')}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => {
          // Chain is a quote: it always shows its floor, never an annual split.
          const perMonth = annual && !tier.chain ? Math.round(annualPrice(tier.monthly) / 12) : tier.monthly;
          return (
            <div
              key={tier.name}
              className={`pcard relative flex min-w-0 flex-col p-5 sm:p-6 ${
                tier.hl ? 'border-brass shadow-[0_24px_50px_-30px_rgba(201,154,46,.5)]' : ''
              }`}
            >
              {tier.hl && (
                <span className="absolute -top-3 left-5 rounded-full bg-brass-2 px-2.5 py-1 text-[11px] font-bold text-hero-deep">
                  {t('lp.hl')}
                </span>
              )}
              <p className="font-display font-semibold text-ink-2">{tier.name}</p>
              <p className="tnum mt-2 font-display text-4xl font-bold leading-none text-ink">
                {tier.chain && <span className="mr-1 text-base font-normal text-ink-3">{t('lp.from')}</span>}
                {perMonth}
                <span className="ml-1.5 text-base font-normal text-ink-3">{t('lp.mo')}</span>
              </p>
              <p className="tnum mt-1.5 min-h-[18px] text-[12px] text-ink-3">
                {tier.chain ? t('lp.c.bill') : annual ? t('lp.billed.annual', { n: annualPrice(tier.monthly) }) : t('lp.billed.monthly')}
              </p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {tier.feats.split(' · ').map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm leading-snug text-ink-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-brass" aria-hidden>
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
                  className="btn btn-line btn-sm mt-6"
                >
                  {t('lp.c.cta')}
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-ink-2">
        <span className="text-brass">✓</span> {t('lp.guarantee')}
      </p>
      <p className="mt-2 text-center text-xs text-ink-3">{t('lp.note')}</p>
      <div className="mt-6 text-center">
        <a
          href={contactHref()}
          target={contactIsWhatsApp() ? '_blank' : undefined}
          rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
          className="btn btn-brass"
        >
          {t('biz.cta')}
        </a>
      </div>
    </section>
  );
}
