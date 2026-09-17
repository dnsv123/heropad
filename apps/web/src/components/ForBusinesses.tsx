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
      title: t('biz.b1.t'),
      text: t('biz.b1.d'),
    },
    {
      icon: svg(['M4 20h16', 'M7 16v-5', 'M12 16V6', 'M17 16v-8']),
      title: t('biz.b2.t'),
      text: t('biz.b2.d'),
    },
    {
      icon: svg(['M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z', 'M9 12l2 2 4-4']),
      title: t('biz.b3.t'),
      text: t('biz.b3.d'),
    },
    {
      icon: svg(['M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9z', 'M8 11V7a4 4 0 0 1 8 0v4']),
      title: t('biz.b4.t'),
      text: t('biz.b4.d'),
    },
  ];

  return (
    <section id="business" className="relative scroll-mt-20">
      <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        {/* One step up from the page: the sales section is its own panel,
            with the mascot flying in from the corner on wide screens. */}
        <div className="card relative overflow-hidden p-6 md:p-10">
          <img
            src="/super-victor-fly-1.webp"
            alt=""
            aria-hidden
            width={440}
            height={620}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute -right-6 -top-4 hidden h-44 w-auto lg:block"
          />

          <div className="md:max-w-2xl">
            <p className="eyebrow">{t('hero.cta.business')}</p>
            <h2 className="mt-3 font-display text-2xl font-bold md:text-3xl">{t('biz.title')}</h2>
            <p className="mt-2 text-sm text-slate-400 md:text-base">{t('biz.sub')}</p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-hero-navy2/60 p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hero-deep text-hero-gold">
                  {b.icon}
                </span>
                <span>
                  <p className="font-display font-semibold text-white">{b.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{b.text}</p>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
            <a
              href={contactHref()}
              target={contactIsWhatsApp() ? '_blank' : undefined}
              rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
              className="btn btn-primary"
            >
              {t('biz.cta')}
            </a>
            <p className="text-sm text-slate-400">{t('biz.pricing')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
