import { Link } from 'react-router-dom';

import { useT } from '../i18n';

// Landing → ecosystem: HeroPad is one door into the SuperVictor Universe.
// External links open in new tabs; internal ones use the router; a door that
// is not open yet says so and does not open.
export default function Ecosystem() {
  const { t } = useT();

  const cards: Array<{
    icon: string;
    title: string;
    text: string;
    href: string;
    external: boolean;
    soon?: boolean;
  }> = [
    {
      icon: '🏛️',
      title: t('eco.hall.t'),
      text: t('eco.hall.d'),
      href: 'https://supervictornft.com',
      external: true,
    },
    {
      icon: '🛍️',
      title: t('eco.shop.t'),
      text: t('eco.shop.d'),
      href: 'https://supervictor.shop',
      external: true,
    },
    {
      icon: '📖',
      title: t('eco.comic.t'),
      text: t('eco.comic.d'),
      href: 'https://www.amazon.com/dp/B0CW62SY47',
      external: true,
    },
    {
      icon: '🎮',
      title: t('eco.vdash.t'),
      text: t('eco.vdash.d'),
      href: '/v-dash',
      external: false,
    },
    {
      icon: '💛',
      title: t('eco.league.t'),
      text: t('eco.league.d'),
      href: 'https://victorleague.com',
      external: true,
    },
    {
      icon: '🦸',
      title: t('eco.claim.t'),
      text: t('eco.claim.d'),
      href: '/claim',
      external: false,
      soon: true,
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
        {t('eco.title')}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400 md:text-base">
        {t('eco.sub')}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const inner = (
            <div
              className={`card-sm relative h-full p-5 text-center transition ${
                c.soon ? 'opacity-70' : 'hover:border-white/20'
              }`}
            >
              {c.soon && (
                <span className="chip absolute right-3 top-3 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                  {t('eco.soon')}
                </span>
              )}
              <span className="text-2xl">{c.icon}</span>
              <p className="mt-2 font-display font-semibold text-white">{c.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.text}</p>
            </div>
          );
          if (c.soon) return <div key={c.title}>{inner}</div>;
          return c.external ? (
            <a key={c.title} href={c.href} target="_blank" rel="noopener noreferrer">
              {inner}
            </a>
          ) : (
            <Link key={c.title} to={c.href}>
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
