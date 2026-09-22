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
    { icon: '🏛️', title: t('eco.hall.t'), text: t('eco.hall.d'), href: 'https://supervictornft.com', external: true },
    { icon: '🛍️', title: t('eco.shop.t'), text: t('eco.shop.d'), href: 'https://supervictor.shop', external: true },
    { icon: '📖', title: t('eco.comic.t'), text: t('eco.comic.d'), href: 'https://www.amazon.com/dp/B0CW62SY47', external: true },
    { icon: '🎮', title: t('eco.vdash.t'), text: t('eco.vdash.d'), href: '/v-dash', external: false },
    { icon: '💛', title: t('eco.league.t'), text: t('eco.league.d'), href: 'https://victorleague.com', external: true },
    { icon: '🦸', title: t('eco.claim.t'), text: t('eco.claim.d'), href: '/claim', external: false, soon: true },
  ];

  return (
    <section className="relative mx-auto max-w-6xl px-5 py-14 sm:px-6 md:py-20">
      {/* The universe's own illustration, a gauntlet holding the phone with
          the SVU mark: the door from the street into the rest. Desktop only,
          off to the side, so the cards keep their room. */}
      <img
        src="/brand/svu-hand.webp"
        alt=""
        aria-hidden
        width={564}
        height={640}
        loading="lazy"
        decoding="async"
        className="pointer-events-none absolute -left-6 top-10 hidden w-56 opacity-90 lg:block xl:w-64"
      />
      <div className="text-center">
        {/* The universe's own mark — the registered SuperVictor logo — sits
            here, where the universe is the subject. */}
        <img
          src="/brand/supervictor-logo.webp"
          alt="SuperVictor"
          width={512}
          height={489}
          loading="lazy"
          decoding="async"
          className="mx-auto h-20 w-auto md:h-24"
        />
        <h2 className="mt-4 text-balance font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          {t('eco.title')}
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-ink-2 md:text-base">{t('eco.sub')}</p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const inner = (
            <div
              className={`pcard relative h-full p-4 text-left sm:p-5 ${
                c.soon ? 'opacity-60' : 'transition hover:border-ink/25'
              }`}
            >
              {c.soon && (
                <span className="absolute right-3 top-3 rounded-full border border-ink/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                  {t('eco.soon')}
                </span>
              )}
              <span className="text-2xl">{c.icon}</span>
              <p className="mt-2 font-display font-semibold text-ink">{c.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{c.text}</p>
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
