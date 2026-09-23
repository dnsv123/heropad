import { useT } from '../i18n';
import Pic from './Pic';

// Landing → three moments at the counter, each with the real photo of it.
// Square photos: the NFC notification at the bottom of the lock screen is
// the proof in step one, and a 4:3 crop was cutting it off.
const STEPS = [
  { file: 'tap-nfc', k: 'how3.1.k', t: 'how3.1.t', d: 'how3.1.d', cap: 'how3.1.cap' },
  { file: 'plus-one', k: 'how3.2.k', t: 'how3.2.t', d: 'how3.2.d', cap: 'how3.2.cap' },
  { file: 'free-coffee', k: 'how3.3.k', t: 'how3.3.t', d: 'how3.3.d', cap: 'how3.3.cap' },
] as const;

export default function HowItWorks() {
  const { t } = useT();

  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
      <div className="max-w-[62ch]">
        <h2 className="caption">{t('how3.eyebrow')}</h2>
        <p className="mt-5 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-[2.6rem]">
          {t('how3.title')}
        </p>
        <p className="mt-3 text-base text-ink-2 md:text-lg">{t('how3.sub')}</p>
      </div>

      <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-5 md:gap-8">
        {STEPS.map((s, i) => (
          <li key={s.file} className="min-w-0">
            <div className="photo aspect-square">
              <Pic
                base={`/photos/${s.file}`}
                widths={[400, 640, 900]}
                fallback={640}
                sizes="(min-width: 1024px) 340px, (min-width: 640px) 30vw, 92vw"
                width={1600}
                height={1600}
                alt={t(s.t)}
              />
              <span className="cap">{t(s.cap)}</span>
            </div>
            <p className="kicker mt-5">{i + 1} · {t(s.k)}</p>
            <h3 className="mt-1 font-display text-xl font-bold text-ink">{t(s.t)}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{t(s.d)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
