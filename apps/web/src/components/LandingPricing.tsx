import { useState } from 'react';

import { useT } from '../i18n';
import { annualPrice } from '../lib/plans';
import { chainContactHref, contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing → public pricing. We tell café owners "competitors hide their price
// behind Let's-talk; we publish ours" — so the site has to actually publish
// it. Unlimited customers on every plan is the structural differentiator and
// it is said here, not implied.
//
// Monthly / annual: one segmented control above the cards, annual selected
// by default. Annual is "ten months paid, twelve served" and is said as
// "2 months free". The Founding Partner offer is NOT on the public site: it
// is the pitch for the first ten cafés, made in person.
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
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-12 md:py-16">
      <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
        {t('lp.title')}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400 md:text-base">
        {t('lp.sub')}
      </p>

      {/* The toggle. Two segments, the active one a step up; the annual
          segment carries the "2 months free" chip so the saving is visible
          before it is chosen. */}
      <div className="mt-8 flex justify-center">
        <div className="inline-flex rounded-full border border-white/10 bg-hero-navy p-1">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              !annual ? 'bg-hero-navy2 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('lp.toggle.monthly')}
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${
              annual ? 'bg-hero-navy2 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('lp.toggle.annual')}
            <span className="rounded-full bg-hero-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-hero-deep">
              {t('lp.toggle.free')}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => {
          const perMonth = annual ? Math.round(annualPrice(tier.monthly) / 12) : tier.monthly;
          return (
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
                {tier.chain && <span className="mr-1 text-base font-normal text-slate-500">{t('lp.from')}</span>}
                {perMonth}
                <span className="ml-1.5 text-base font-normal text-slate-500">{t('lp.mo')}</span>
              </p>
              {/* The second line says how it is paid, so nobody discovers the
                  annual sum at the invoice. */}
              <p className="tnum mt-1.5 min-h-[18px] text-[12px] text-slate-500">
                {annual
                  ? t('lp.billed.annual', { n: annualPrice(tier.monthly) })
                  : t('lp.billed.monthly')}
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
          );
        })}
      </div>

      {/* The guarantee sits under the cards: it costs nothing and it is the
          line that makes "annual" a safe choice for an owner deciding in one
          conversation. */}
      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-300">
        <span className="text-hero-gold">✓</span> {t('lp.guarantee')}
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
