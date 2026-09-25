import { useT, type TranslationKey } from '../i18n';

// Landing → the questions owners actually ask at the counter, one plain
// answer each. Native <details>: no script, keyboard and screen-reader
// friendly, and every answer is in the page for search engines.
const QA: Array<[TranslationKey, TranslationKey]> = [
  ['obj.1.q', 'obj.1.a'],
  ['obj.2.q', 'obj.2.a'],
  ['obj.3.q', 'obj.3.a'],
  ['obj.4.q', 'obj.4.a'],
  ['obj.5.q', 'obj.5.a'],
  ['obj.6.q', 'obj.6.a'],
];

export default function Objections() {
  const { t } = useT();

  return (
    <section id="intrebari" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-16 sm:px-6 md:pt-24">
      <div className="grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-14">
        <div className="max-w-[40ch]">
          <p className="kicker">{t('obj.kicker')}</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-[2.4rem]">
            {t('obj.title')}
          </h2>
        </div>
        <div className="grid gap-3">
          {QA.map(([q, a]) => (
            <details key={q} className="group panel-quiet px-5 py-4 open:bg-paper-2 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-[17px] font-bold text-ink [&::-webkit-details-marker]:hidden">
                {t(q)}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-ink-3 transition group-open:rotate-45" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </summary>
              <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">{t(a)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
