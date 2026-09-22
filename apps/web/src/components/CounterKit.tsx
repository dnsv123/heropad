import { useT } from '../i18n';

// Landing → what physically lands on the counter. Until the pins and the
// display arrive, the photo is the hero beside the till at Bătrânu' Sas.
const ITEMS = [
  ['kit.1.t', 'kit.1.d'],
  ['kit.2.t', 'kit.2.d'],
  ['kit.3.t', 'kit.3.d'],
  ['kit.4.t', 'kit.4.d'],
] as const;

export default function CounterKit() {
  const { t } = useT();

  return (
    <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-6 md:pb-20">
      <div className="grid items-center gap-8 md:grid-cols-[0.95fr_1.05fr] md:gap-12">
        <div className="photo aspect-[16/11]">
          <img
            src="/photos/counter-hero-800.webp"
            srcSet="/photos/counter-hero-520.webp 520w, /photos/counter-hero-800.webp 800w, /photos/counter-hero-1200.webp 1200w"
            sizes="(min-width: 1024px) 520px, (min-width: 768px) 46vw, 92vw"
            width={1600}
            height={1100}
            alt="The SuperVictor figurine beside the till at Bătrânu' Sas"
            loading="lazy"
            decoding="async"
          />
          <span className="cap">{t('kit.cap')}</span>
        </div>
        <div className="min-w-0">
          <p className="eyebrow-brass">{t('kit.eyebrow')}</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-4xl">
            {t('kit.title')}
          </h2>
          <ul className="mt-6 grid gap-3.5">
            {ITEMS.map(([tt, dd], i) => (
              <li key={tt} className="flex items-start gap-3">
                <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brass-2 text-[12px] font-bold text-hero-deep">
                  {i + 1}
                </span>
                <span className="text-[15px] leading-snug text-ink-2">
                  <b className="font-semibold text-ink">{t(tt)}</b> {t(dd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
