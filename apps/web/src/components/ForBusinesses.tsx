import { motion } from 'framer-motion';

import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing → "#business": the merchant-facing pitch section. This is where the
// hero's primary CTA lands. Benefits + pilot offer + a contact CTA (WhatsApp
// when a number is configured, email otherwise).
export default function ForBusinesses() {
  const { t } = useT();

  // Inline stroke icons instead of emoji: emoji render differently on every
  // OS and read as filler; a 1.8px stroke set stays crisp, on-palette, and
  // costs nothing.
  const svg = (paths: string[]) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );

  const benefits = [
    {
      icon: svg(['M17 2l4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3']),
      tint: 'bg-hero-cyan/15 text-hero-cyan',
      title: t('biz.b1.t'),
      text: t('biz.b1.d'),
    },
    {
      icon: svg(['M4 20h16', 'M7 16v-5', 'M12 16V6', 'M17 16v-8']),
      tint: 'bg-hero-cyan/15 text-hero-cyan',
      title: t('biz.b2.t'),
      text: t('biz.b2.d'),
    },
    {
      icon: svg(['M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z', 'M9 12l2 2 4-4']),
      tint: 'bg-hero-gold/15 text-hero-gold',
      title: t('biz.b3.t'),
      text: t('biz.b3.d'),
    },
    {
      icon: svg(['M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9z', 'M8 11V7a4 4 0 0 1 8 0v4']),
      tint: 'bg-hero-gold/15 text-hero-gold',
      title: t('biz.b4.t'),
      text: t('biz.b4.d'),
    },
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
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${b.tint}`}
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
            href={contactHref()}
            target={contactIsWhatsApp() ? '_blank' : undefined}
            rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
            className="rounded-full bg-hero-gold px-8 py-3 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
          >
            {t('biz.cta')}
          </a>
        </div>
      </div>
    </section>
  );
}
