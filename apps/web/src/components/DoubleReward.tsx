import { useT } from '../i18n';

// Landing → the double reward: the mechanic the positioning rests on. The
// venue keeps the reward it already gives; HeroPad adds BITS and a trophy at
// its own cost. Two cards side by side, the venue's first, because the owner
// reads their own part before ours.
export default function DoubleReward() {
  const { t } = useT();

  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 md:pt-24">
      <div className="max-w-[62ch]">
        <p className="kicker">{t('dr.kicker')}</p>
        <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-[2.6rem]">
          {t('dr.title')}
        </h2>
        <p className="mt-3 text-base text-ink-2 md:text-lg">{t('dr.sub')}</p>
      </div>

      <div className="mt-9 grid gap-4 md:grid-cols-2 md:gap-5">
        <div className="panel-quiet flex items-start gap-5 p-6 sm:p-7">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden>
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
              <path d="M6 2v2" />
              <path d="M10 2v2" />
              <path d="M14 2v2" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="kicker block">{t('dr.you.k')}</span>
            <span className="mt-1 block font-display text-2xl font-bold text-ink">{t('dr.you.t')}</span>
            <span className="mt-2 block text-[15px] leading-relaxed text-ink-2">{t('dr.you.d')}</span>
          </span>
        </div>

        <div className="relative flex items-start gap-5 overflow-hidden rounded-3xl bg-brand-deep p-6 text-white shadow-soft sm:p-7">
          <img
            src="/cnft/trophy-starter.webp"
            alt=""
            width={112}
            height={112}
            loading="lazy"
            decoding="async"
            className="h-14 w-14 shrink-0 rounded-full bg-white/10 object-contain p-1"
          />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-amber">{t('dr.hp.k')}</span>
            <span className="mt-1 block font-display text-2xl font-bold">{t('dr.hp.t')}</span>
            <span className="mt-2 block text-[15px] leading-relaxed text-white/85">{t('dr.hp.d')}</span>
          </span>
        </div>
      </div>
      <p className="mt-5 text-[15px] font-semibold text-ink">{t('dr.foot')}</p>
    </section>
  );
}
