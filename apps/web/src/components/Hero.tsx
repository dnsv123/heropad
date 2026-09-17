import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing hero — the promise as the headline, the product as a small card
// the mascot is presenting. Two columns on desktop, mascot first on mobile.
//
// Design rules this screen obeys (see tailwind.config.js):
//   - no glow ring, no gradient box around the mascot: he stands on a flat
//     navy disc, the way an app icon sits on a home screen;
//   - one gold button, one secondary;
//   - the only motion is a transform-only float on the mascot.
//
// CTA strategy:
//   - Primary gold: "For businesses" → scrolls to the #business section.
//   - Secondary: talk to us (WhatsApp when configured, else email).
//
// index.html paints this exact block as static HTML before React boots
// (#prehero). Markup and classes are mirrored there — change one, change both.
export default function Hero() {
  const { t } = useT();

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-10 md:grid-cols-[1.1fr_0.9fr] md:gap-8 md:py-20">
        {/* Copy column — rendered AT REST, no entrance fade (it is already on
            screen from the static shell; a fade here would blink it). */}
        <div className="order-2 text-center md:order-1 md:text-left">
          <p className="eyebrow">HeroPad Power Pass</p>

          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            {t('hero.eyebrow')}
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base text-slate-300 md:mx-0 md:text-lg">
            {t('hero.subtitle')}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <a href="#business" className="btn btn-primary">
              {t('hero.cta.business')}
            </a>

            {/* The second CTA is the demo, not "Claim a hero": this page sells
                to café owners, and to one of them "Claim a hero" means nothing. */}
            <a
              href={contactHref()}
              target={contactIsWhatsApp() ? '_blank' : undefined}
              rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
              className="btn btn-ghost"
            >
              {t('biz.cta')}
            </a>
          </div>

          <p className="mt-6 text-xs text-slate-500">
            <a
              href="https://supervictornft.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 transition hover:text-white"
            >
              {t('hero.project')}
            </a>
          </p>
        </div>

        {/* The stage: mascot on a flat disc, the customer card in his hands.
            The mascot is the LCP element — it paints the instant it arrives;
            nothing here starts at opacity 0. */}
        <div className="relative order-1 mx-auto w-full max-w-[250px] md:order-2 md:max-w-[370px]">
          <div
            aria-hidden
            className="absolute left-1/2 top-[44%] aspect-square h-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-hero-navy"
          />
          <img
            src="/super-victor-hero.webp"
            srcSet="/super-victor-hero-320.webp 320w, /super-victor-hero.webp 480w"
            sizes="(min-width: 768px) 370px, 250px"
            width={480}
            height={753}
            alt="SuperVictor — the official HeroPad mascot"
            className="relative h-auto w-full animate-float"
          />

          {/* The product, at a glance: a real card's anatomy in 176px. */}
          <div className="absolute -left-3 bottom-[9%] w-[150px] rounded-2xl border border-white/10 bg-hero-navy/95 p-3 text-left backdrop-blur md:-left-8 md:w-[176px] md:p-3.5">
            <p className="text-[9px] uppercase tracking-[0.18em] text-hero-cyan">{t('hero.card.label')}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-300">Café Victor</p>
            <p className="tnum mt-1 font-display text-2xl font-bold leading-none text-white">
              3<span className="text-base text-slate-500">/5</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hero-navy2">
              <div className="h-full w-3/5 rounded-full bg-hero-gold" />
            </div>
            <p className="mt-2 text-[10px] font-medium text-hero-gold">🎁 {t('hero.card.reward')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
