import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';
import { Art } from './Pic';

// Landing → "#business": the owner's pitch, in the one deep-navy panel on
// the page, with the logo's amber for the button, where the owner decides. SuperVictor
// flies in his own grid column on wide screens, never over the text.

// 1.5px stroke icons: emoji render differently on every OS and the brand
// sheet keeps them out of interface text.
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
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
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
    <section id="business" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[28px] bg-brand-deep p-6 text-white shadow-soft sm:p-8 md:p-10">
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-10">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-amber">{t('hero.cta.business')}</p>
              <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight md:text-[2.4rem]">
                {t('biz.title')}
              </h2>
              <p className="mt-3 max-w-[56ch] text-base text-white/85 md:text-lg">{t('biz.sub')}</p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {benefits.map((b) => (
                  <div key={b.title} className="flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.05] p-4 sm:p-5">
                    <Icon name={b.icon} />
                    <span className="min-w-0">
                      <span className="block font-display font-bold text-white">{b.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-white/80">{b.text}</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <a
                  href={contactHref()}
                  target={contactIsWhatsApp() ? '_blank' : undefined}
                  rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
                  className="pbtn pbtn-sun"
                >
                  {t('biz.cta')}
                </a>
                <p className="text-sm font-semibold text-white/85">{t('biz.foot')}</p>
              </div>
            </div>

            <div className="hidden lg:block">
              <Art src="/super-victor-fly-1.webp" width={428} height={640} alt="" className="w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
