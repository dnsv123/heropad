import { Link } from 'react-router-dom';

import { useT } from '../i18n';

// Landing → the universe HeroPad belongs to. Same doors, same words as the
// umbrella site (supervictoruniverse.com), so a visitor who crosses over
// recognises the place. The registered SuperVictor logo appears here, where
// the universe is the subject, at its own colours and proportions.
//
// External links open in new tabs; internal ones use the router; a door that
// is not open yet is drawn in pencil (dashed) and does not open.

const ICONS: Record<string, string[]> = {
  hall: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'],
  shop: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  comic: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  vdash: ['M6 12h4', 'M8 10v4', 'M15 13h.01', 'M18 11h.01', 'M17.32 5H6.68a4 4 0 0 0-3.978 3.59l-.9 9.03A2.2 2.2 0 0 0 4 20c1 0 1.6-.5 2.1-1.2L7.5 17h9l1.4 1.8c.5.7 1.1 1.2 2.1 1.2a2.2 2.2 0 0 0 2.2-2.38l-.9-9.03A4 4 0 0 0 17.32 5z'],
  league: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  claim: ['M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-5-3.6-5 3.6 1.9-5.8L4 8.8h6.1z'],
};

export default function Ecosystem() {
  const { t } = useT();

  const doors: Array<{ icon: keyof typeof ICONS; title: string; text: string; href: string; external: boolean; soon?: boolean }> = [
    { icon: 'hall', title: t('eco.hall.t'), text: t('eco.hall.d'), href: 'https://supervictornft.com', external: true },
    { icon: 'shop', title: t('eco.shop.t'), text: t('eco.shop.d'), href: 'https://supervictor.shop', external: true },
    { icon: 'comic', title: t('eco.comic.t'), text: t('eco.comic.d'), href: 'https://www.amazon.com/dp/B0CW62SY47', external: true },
    { icon: 'vdash', title: t('eco.vdash.t'), text: t('eco.vdash.d'), href: '/v-dash', external: false },
    { icon: 'league', title: t('eco.league.t'), text: t('eco.league.d'), href: 'https://victorleague.com', external: true },
    { icon: 'claim', title: t('eco.claim.t'), text: t('eco.claim.d'), href: '/claim', external: false, soon: true },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 pt-16 sm:px-6 md:pt-24">
      <div className="grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8">
        <img
          src="/brand/supervictor-logo.webp"
          alt="SuperVictor"
          width={512}
          height={489}
          loading="lazy"
          decoding="async"
          className="h-24 w-auto md:h-28"
        />
        <div className="min-w-0">
          <h2 className="caption-sv">SuperVictor Universe</h2>
          <p className="mt-4 text-balance font-display text-2xl font-bold leading-tight tracking-tight text-ink md:text-3xl">
            {t('eco.title')}
          </p>
          <p className="mt-2 max-w-[58ch] text-base text-ink-2">{t('eco.sub')}</p>
        </div>
      </div>

      <ul className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doors.map((d) => {
          const inner = (
            <span
              className={`flex h-full items-start gap-4 rounded-3xl border p-4 sm:p-5 ${
                d.soon
                  ? 'border-dashed border-ink/20 text-ink-2'
                  : 'border-ink/10 bg-paper-2 transition hover:border-ink/25'
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  d.soon ? 'border border-dashed border-ink/25' : 'bg-electric-soft text-electric'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                  {ICONS[d.icon].map((p) => (
                    <path key={p} d={p} />
                  ))}
                </svg>
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold text-ink">{d.title}</span>
                  {d.soon && (
                    <span className="rounded-full border border-ink/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                      {t('eco.soon')}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-2">{d.text}</span>
              </span>
            </span>
          );
          if (d.soon) return <li key={d.title}>{inner}</li>;
          return (
            <li key={d.title}>
              {d.external ? (
                <a href={d.href} target="_blank" rel="noopener noreferrer" className="block h-full">
                  {inner}
                </a>
              ) : (
                <Link to={d.href} className="block h-full">
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
