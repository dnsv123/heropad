import { useT } from '../i18n';

// Landing → "How Power Pass works": the customer journey in 4 steps.
// Numbered, not iconed: four emoji in a row read as a toy; four big tabular
// numerals read as a sequence.
export default function HowItWorks() {
  const { t } = useT();

  const steps = [
    { title: t('how.s1.t'), text: t('how.s1.d') },
    { title: t('how.s2.t'), text: t('how.s2.d') },
    { title: t('how.s3.t'), text: t('how.s3.d') },
    { title: t('how.s4.t'), text: t('how.s4.d') },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <h2 className="text-center font-display text-2xl font-bold md:text-3xl">
        {t('how.title')}
      </h2>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.title} className="card-sm p-5">
            <span className="tnum font-display text-3xl font-bold leading-none text-hero-gold">
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="mt-3 font-display font-semibold text-white">{s.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
