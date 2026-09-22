import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';

// Landing → "#business": the merchant-facing pitch section. This is where the
// hero's primary CTA lands. Benefits + pilot offer + a contact CTA (WhatsApp
// when a number is configured, email otherwise).

// Inline 1.5px stroke icons on a quiet tile — the iOS Settings look. Emoji
// render differently on every OS and read as filler; a thin white stroke on
// a hairline tile reads as a system icon.
const ICONS: Record<string, string[]> = {
  repeat: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
  chart: ['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  shield: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    'm9 12 2 2 4-4',
  ],
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.07] text-white">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[22px] w-[22px]"
        aria-hidden
      >
        {ICONS[name].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

export default function ForBusinesses() {
  const { t } = useT();

  const benefits: Array<{ icon: keyof typeof ICONS; title: string; text: string }> = [
    { icon: 'repeat', title: t('biz.b1.t'), text: t('biz.b1.d') },
    { icon: 'chart', title: t('biz.b2.t'), text: t('biz.b2.d') },
    { icon: 'shield', title: t('biz.b3.t'), text: t('biz.b3.d') },
    { icon: 'lock', title: t('biz.b4.t'), text: t('biz.b4.d') },
  ];

  return (
    <section id="business" className="relative scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-6 md:py-8">
        {/* One step up from the page: the sales section is its own panel,
            with the mascot flying in the top corner on wide screens — inside
            the panel, fully, like a sticker on the card. */}
        <div className="relative overflow-hidden rounded-[28px] bg-hero-deep p-6 text-white md:p-10">
          <img
            src="/super-victor-fly-1.webp"
            alt=""
            aria-hidden
            width={440}
            height={620}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute right-8 top-6 hidden h-36 w-auto lg:block"
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
                className="flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-hero-navy2/50 p-5"
              >
                <Icon name={b.icon} />
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
            <p className="text-sm text-slate-400">{t('biz.foot')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
