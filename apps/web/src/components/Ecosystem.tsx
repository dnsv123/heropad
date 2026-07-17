import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

import { useT } from '../i18n';

// Landing → ecosystem: HeroPad is one door into the SuperVictor Universe.
// External links open in new tabs; internal ones use the router.
// TODO: swap the Comic Book link for the exact Amazon URL when Valentin
// provides it (points to the shop meanwhile).
export default function Ecosystem() {
  const { t } = useT();

  const cards: Array<{
    icon: string;
    title: string;
    text: string;
    href: string;
    external: boolean;
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
      href: 'https://supervictor.shop',
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
      icon: '🦸',
      title: t('eco.claim.t'),
      text: t('eco.claim.d'),
      href: '/claim',
      external: false,
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

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c, i) => {
          const inner = (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="h-full rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-5 text-center transition hover:border-hero-cyan/50 hover:bg-hero-deep/80"
            >
              <span className="text-3xl">{c.icon}</span>
              <p className="mt-2 font-display font-semibold text-white">{c.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.text}</p>
            </motion.div>
          );
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
