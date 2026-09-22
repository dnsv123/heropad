import { useT } from '../i18n';

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
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-14 sm:px-6 md:py-20">
      <div className="max-w-[60ch]">
        <p className="eyebrow-brass">{t('how3.eyebrow')}</p>
        <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-4xl">
          {t('how3.title')}
        </h2>
        <p className="mt-3 text-base text-ink-2">{t('how3.sub')}</p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-3 sm:gap-4 md:mt-10 md:gap-6">
        {STEPS.map((s) => (
          <div key={s.file} className="min-w-0">
            <div className="photo aspect-square">
              <img
                src={`/photos/${s.file}-640.webp`}
                srcSet={`/photos/${s.file}-400.webp 400w, /photos/${s.file}-640.webp 640w, /photos/${s.file}-900.webp 900w`}
                sizes="(min-width: 1024px) 352px, (min-width: 640px) 30vw, 92vw"
                width={1600}
                height={1600}
                alt={t(s.t)}
                loading="lazy"
                decoding="async"
              />
              <span className="cap">{t(s.cap)}</span>
            </div>
            <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.12em] text-brass">{t(s.k)}</p>
            <h3 className="mt-1 font-display text-lg font-semibold text-ink">{t(s.t)}</h3>
            <p className="mt-1 text-sm text-ink-2">{t(s.d)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
