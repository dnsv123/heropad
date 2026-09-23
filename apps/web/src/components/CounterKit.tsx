import { useT } from '../i18n';
import Pic from './Pic';

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
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 md:pb-24">
      <div className="grid items-center gap-10 md:grid-cols-[0.95fr_1.05fr] md:gap-14">
        <div className="photo aspect-[16/11]">
          <Pic
            base="/photos/counter-hero"
            widths={[520, 800, 1200]}
            fallback={800}
            sizes="(min-width: 1024px) 520px, (min-width: 768px) 46vw, 92vw"
            width={1600}
            height={1100}
            alt="The SuperVictor figurine beside the till at Bătrânu' Sas"
          />
          <span className="cap">{t('kit.cap')}</span>
        </div>
        <div className="min-w-0">
          <p className="kicker">{t('kit.eyebrow')}</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-[2.4rem]">
            {t('kit.title')}
          </h2>
          <ul className="mt-7 grid gap-4">
            {ITEMS.map(([tt, dd], i) => (
              <li key={tt} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-electric font-display text-[13px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-[15px] leading-relaxed text-ink-2">
                  <b className="font-bold text-ink">{t(tt)}</b> {t(dd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
