import { useState } from 'react';

import { useT } from '../i18n';
import { annualPrice } from '../lib/plans';
import { priceNumber } from '../lib/money';
import { chainContactHref, contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing → public pricing. We tell café owners "competitors hide their price
// behind Let's-talk; we publish ours", so the site has to actually publish
// it. Unlimited customers on every plan is the structural differentiator and
// it is said here, not implied.
//
// Monthly / annual: one segmented control above the cards, annual selected
// by default. Annual is "ten months paid, twelve served" and is said as
// "2 months free". The Founding Partner offer is NOT on the public site.
//
// The plan most owners pick is the only raised panel (cream, hard shadow,
// a sun sticker); the others sit flat. One loud thing per row.
export default function LandingPricing() {
  const { t, lang } = useT();
  const [annual, setAnnual] = useState(true);
  // Lei in Romanian, dollars in English: see lib/money.ts.
  const money = (ron: number) => priceNumber(lang, ron) + (lang === 'ro' ? ' lei' : '');

  const tiers = [
    { name: 'Starter', monthly: 99, feats: t('lp.s.feats'), hl: false, chain: false },
    { name: 'Branded', monthly: 199, feats: t('lp.b.feats'), hl: true, chain: false },
    { name: 'Growth', monthly: 349, feats: t('lp.g.feats'), hl: false, chain: false },
    { name: 'Chain', monthly: 699, feats: t('lp.c.feats'), hl: false, chain: true },
  ];

  const seg = (on: boolean) =>
    `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition sm:px-5 ${
      on ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'
    }`;

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-16 sm:px-6 md:pt-24">
      <div className="max-w-[62ch]">
        <h2 className="caption">{t('nav.pricing')}</h2>
        <p className="mt-5 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-[2.4rem]">
          {t('lp.title')}
        </p>
        <p className="mt-3 text-base text-ink-2 md:text-lg">{t('lp.sub')}</p>
      </div>

      <div className="mt-8 inline-flex max-w-full rounded-full border-2 border-ink bg-paper-2 p-1" role="group" aria-label={t('nav.pricing')}>
        <button type="button" onClick={() => setAnnual(false)} aria-pressed={!annual} className={seg(!annual)}>
          {t('lp.toggle.monthly')}
        </button>
        <button type="button" onClick={() => setAnnual(true)} aria-pressed={annual} className={seg(annual)}>
          {t('lp.toggle.annual')}
          <span className="rounded-full border-2 border-ink bg-sun px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-ink">
            {t('lp.toggle.free')}
          </span>
        </button>
      </div>

      <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {tiers.map((tier) => {
          // Chain is a quote: it always shows its floor, never an annual split.
          const perMonth = annual && !tier.chain ? Math.round(annualPrice(tier.monthly) / 12) : tier.monthly;
          return (
            <div
              key={tier.name}
              className={`relative flex min-w-0 flex-col rounded-[10px] border-2 border-ink p-5 sm:p-6 ${
                tier.hl ? 'bg-sun-soft shadow-panel' : 'bg-paper-2'
              }`}
            >
              {tier.hl && (
                <span className="absolute -top-3.5 right-4 rotate-2 rounded-md border-2 border-ink bg-sun px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-ink">
                  {t('lp.hl')}
                </span>
              )}
              <p className="font-display text-lg font-bold text-ink">{tier.name}</p>
              <p className="mt-3 font-display text-[2.6rem] font-bold leading-none tracking-tight text-ink">
                {tier.chain && <span className="mr-1 text-base font-semibold text-ink-3">{t('lp.from')}</span>}
                {priceNumber(lang, perMonth)}
                <span className="ml-1.5 text-base font-semibold text-ink-3">
                  {lang === 'ro' ? 'lei ' : ''}
                  {t('lp.mo')}
                </span>
              </p>
              <p className="mt-2 min-h-[2.6em] text-[12px] font-semibold leading-snug text-ink-3">
                {tier.chain ? t('lp.c.bill') : annual ? t('lp.billed.annual', { n: money(annualPrice(tier.monthly)) }) : t('lp.billed.monthly')}
              </p>

              <ul className="mt-5 flex-1 space-y-2.5 border-t-2 border-ink/10 pt-5">
                {tier.feats.split(' · ').map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm leading-snug text-ink-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-electric" aria-hidden>
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
                  className="pbtn pbtn-white pbtn-sm mt-6"
                >
                  {t('lp.c.cta')}
                </a>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-9 flex flex-col items-start gap-5 rounded-[10px] border-2 border-dashed border-ink/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{t('lp.guarantee')}</p>
          <p className="mt-1 text-[13px] text-ink-3">{t('lp.note')}</p>
        </div>
        <a
          href={contactHref()}
          target={contactIsWhatsApp() ? '_blank' : undefined}
          rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
          className="pbtn pbtn-blue shrink-0"
        >
          {t('biz.cta')}
        </a>
      </div>
    </section>
  );
}
