import { motion } from 'framer-motion';

import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing hero — Power Pass first (the product we sell today), the SuperVictor
// universe as the wrapper. Two-column on desktop, stacked on mobile; mascot
// floats with a rotating glow ring. Copy is fully bilingual via i18n.
//
// CTA strategy:
//   - Primary gold: "For businesses" → scrolls to the #business section.
//   - Secondary outline: talk to us (WhatsApp when configured, else email).
export default function Hero() {
  const { t } = useT();

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-12 md:flex-row md:gap-12 md:py-24">
        {/* Character art — first on mobile, right side on desktop. NO entrance
           animation on this container: the mascot is the LCP element, and an
           initial opacity of 0 made the browser count LCP only after React
           hydrated AND the fade finished — a 10s LCP on throttled mobile for
           an image that was already downloaded. It now paints the instant it
           arrives; the float loop below is transform-only and LCP-neutral. */}
        <div className="relative order-first w-full max-w-[220px] flex-shrink-0 md:order-last md:max-w-sm md:flex-1">
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-3xl"
            style={{
              background:
                'conic-gradient(from 0deg, rgba(93,211,255,0.0), rgba(93,211,255,0.25), rgba(245,200,66,0.25), rgba(153,69,255,0.25), rgba(93,211,255,0.0))',
              filter: 'blur(24px)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          />
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-hero-blue/30 bg-gradient-to-br from-hero-deep via-hero-blue/20 to-hero-deep">
            <motion.img
              src="/super-victor-hero.webp"
              srcSet="/super-victor-hero-320.webp 320w, /super-victor-hero.webp 480w"
              sizes="(min-width: 768px) 384px, 220px"
              width={480}
              height={753}
              alt="SuperVictor — the official HeroPad mascot"
              className="absolute inset-0 h-full w-full object-contain p-3 md:p-5"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-hero-cyan/20"
            />
          </div>
        </div>

        {/* Copy column. */}
        <div className="flex-1 text-center md:text-left">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-xs uppercase tracking-[0.3em] text-hero-cyan"
          >
            {t('hero.eyebrow')}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-3 font-display text-4xl font-bold tracking-tight md:mt-4 md:text-6xl"
          >
            <span className="bg-gradient-to-r from-hero-gold via-hero-gold-bright to-hero-cyan bg-clip-text text-transparent">
              HeroPad
            </span>{' '}
            <span className="text-white">⚡ Power&nbsp;Pass</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mx-auto mt-3 max-w-xl text-base text-slate-300 md:mx-0 md:mt-4 md:text-lg"
          >
            {t('hero.subtitle')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3 md:mt-10 md:justify-start"
          >
            <a
              href="#business"
              className="group relative overflow-hidden rounded-full bg-hero-gold px-6 py-3 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
            >
              <span className="relative z-10">{t('hero.cta.business')}</span>
              <span
                aria-hidden
                className="absolute inset-y-0 -left-12 w-12 -skew-x-12 bg-white/40 transition-all duration-700 ease-out group-hover:left-[110%]"
              />
            </a>

            {/* The second CTA is the demo, not "Claim a hero".
                This landing page sells to café owners, and to one of them
                "Claim a hero" means nothing — it belonged to a figurine we
                do not sell yet. It is still reachable from the Ecosystem
                section and the menu, where someone holding a figurine will
                look for it. */}
            <a
              href={contactHref()}
              target={contactIsWhatsApp() ? '_blank' : undefined}
              rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
              className="rounded-full border border-hero-cyan/40 px-6 py-3 font-medium text-slate-200 transition hover:border-hero-cyan hover:text-white"
            >
              {t('biz.cta')}
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-6 text-xs text-slate-500 md:mt-8"
          >
            <a
              href="https://supervictornft.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-hero-cyan transition hover:text-hero-gold"
            >
              {t('hero.project')}
            </a>
          </motion.p>
        </div>
      </div>
    </section>
  );
}
