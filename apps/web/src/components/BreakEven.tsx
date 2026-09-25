import { useState } from 'react';

import { useT } from '../i18n';
import { priceNumber, toUsd } from '../lib/money';

// Landing → "what it really costs": the owner types their coffee price and
// how many they sell a day; the page answers with the handful of extra
// coffees a week that cover the plan. The owner's own numbers, one stated
// assumption (60% of the price left after VAT and ingredients), nothing
// counted that we cannot show (reviews, the passport, happy hour).
const PLANS = [99, 199, 349] as const;
const MARGIN = 0.6;
const WEEKS_PER_MONTH = 30 / 7;

export default function BreakEven() {
  const { t, lang } = useT();
  // Untouched, the price follows the language: 15 lei here, $3.5 in English
  // (the plans are shown in dollars there too).
  const [priceIn, setPrice] = useState<string | null>(null);
  const [perDay, setPerDay] = useState('60');
  const [plan, setPlan] = useState<number>(PLANS[0]);

  const price = priceIn ?? (lang === 'en' ? '3.5' : '15');
  const cost = lang === 'en' ? toUsd(plan) : plan;
  const fmt = (n: number) => (lang === 'en' ? `$${n.toFixed(2).replace(/\.00$/, '')}` : `${n.toFixed(1).replace(/\.0$/, '').replace('.', ',')} lei`);

  const p = Math.max(0, Number(price.replace(',', '.')) || 0);
  const d = Math.max(0, Number(perDay) || 0);
  const perCoffee = p * MARGIN;
  const perMonth = perCoffee > 0 ? Math.ceil(cost / perCoffee) : null;
  const perWeek = perMonth !== null ? Math.ceil(cost / perCoffee / WEEKS_PER_MONTH) : null;
  const share = perWeek !== null && d > 0 ? (perWeek / (d * 7)) * 100 : null;
  const shareText =
    share === null
      ? null
      : share < 1
        ? lang === 'en' ? 'under 1' : 'sub 1'
        : share.toFixed(share < 10 ? 1 : 0).replace(/\.0$/, '').replace('.', lang === 'en' ? '.' : ',');

  const field = 'mt-1.5 w-full rounded-2xl border border-ink/15 bg-paper-2 px-4 py-3 font-display text-2xl font-bold text-ink focus:border-brand focus:outline-none';

  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 md:pt-24">
      <div className="max-w-[62ch]">
        <p className="kicker">{t('calc.kicker')}</p>
        <h2 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink md:text-[2.6rem]">
          {t('calc.title')}
        </h2>
      </div>

      <div className="mt-9 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-5">
        <div className="panel-quiet grid content-start gap-5 p-6 sm:p-7">
          <label htmlFor="calc-price" className="block text-sm font-semibold text-ink-2">
            {t('calc.price')}
            <input
              id="calc-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
              autoComplete="off"
              className={field}
            />
          </label>
          <label htmlFor="calc-day" className="block text-sm font-semibold text-ink-2">
            {t('calc.perday')}
            <input
              id="calc-day"
              inputMode="numeric"
              value={perDay}
              onChange={(e) => setPerDay(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className={field}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold text-ink-2">{t('calc.plan')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PLANS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={plan === v}
                  onClick={() => setPlan(v)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    plan === v ? 'border-brand bg-brand text-white' : 'border-ink/15 bg-paper-2 text-ink hover:border-ink/35'
                  }`}
                >
                  {t('calc.planv', { n: priceNumber(lang, v) })}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col justify-center rounded-3xl bg-brand-deep p-6 text-white shadow-soft sm:p-8" aria-live="polite">
          {perWeek === null ? (
            <p className="text-lg text-white/85">{t('calc.empty')}</p>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-white/80">{t('calc.need')}</p>
              <p className="mt-1 font-display text-[4.5rem] font-bold leading-none tracking-tight text-brand-amber">{perWeek}</p>
              <p className="mt-2 text-xl font-bold">{t('calc.unit')}</p>
              <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-white/85">
                {t('calc.then', { m: fmt(perCoffee), plan: priceNumber(lang, plan), c: perMonth ?? 0 })}
                {shareText !== null && <> {t('calc.share', { pct: shareText })}</>}
              </p>
            </>
          )}
          <p className="mt-6 border-t border-white/10 pt-4 text-[12px] leading-relaxed text-white/60">{t('calc.note')}</p>
        </div>
      </div>
    </section>
  );
}
