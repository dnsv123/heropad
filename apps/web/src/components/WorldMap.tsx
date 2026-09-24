import { useEffect, useRef } from 'react';

import { useT } from '../i18n';

// Landing → the one playful window on a serious page: the HeroPad world as a
// map of portals, the owner's venue the first of them. A short muted loop in
// a phone frame; the file is fetched only when the section comes near the
// viewport, and plays only while it is on screen, so the landing's first
// paint pays nothing for it. Reduced motion shows the still poster.
export default function WorldMap() {
  const { t, lang } = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const v = lang === 'ro' ? 'ro' : 'en';

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(
      ([e]) => {
        if (reduce) return;
        if (e.isIntersecting) {
          if (!el.src) el.src = `/video/world-loop-${v}.mp4`;
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { rootMargin: '200px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [v]);

  const points = [t('world.b1'), t('world.b2'), t('world.b3')];

  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 md:pt-24">
      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_270px] md:gap-14 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <p className="kicker">{t('world.kicker')}</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-[2.6rem]">
            {t('world.title')}
          </h2>
          <p className="mt-3 max-w-[56ch] text-base text-ink-2 md:text-lg">{t('world.sub')}</p>
          <ul className="mt-7 grid gap-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15px] leading-relaxed text-ink-2">
                <span className="stamp stamp-on mt-0.5 h-6 w-6 shrink-0" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto w-full max-w-[270px] md:max-w-none">
          <div className="rounded-[44px] bg-ink p-2.5 shadow-soft">
            <video
              ref={ref}
              poster={`/video/world-loop-${v}.webp`}
              muted
              loop
              playsInline
              preload="none"
              width={540}
              height={960}
              aria-label={t('world.alt')}
              className="aspect-[9/16] w-full rounded-[36px] bg-brand-deep object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
