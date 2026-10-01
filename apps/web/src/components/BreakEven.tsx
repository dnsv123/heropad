import { useState } from 'react';

import { useT } from '../i18n';
import { priceNumber, toUsd } from '../lib/money';
import { COFFEES_PER_DAY, compareTo, formatPerCoffee, perCoffeeLei, type Treat } from '../lib/perCoffee';

// Landing → "what it really costs": the owner types how many coffees they
// sell a day and picks what they already give away with the cup (a mint, a
// sugar sachet, a biscuit, honey); the page answers with what HeroPad costs
// on each coffee, said in that same small thing. The thing is the big line;
// the money sits under it, small: no amount is the headline.
//
// On purpose it never says how many customers have to come back: a target
// reads as work the owner has to do. Cost per coffee is a plain division of
// their own number, so it is true for every venue; what returning customers
// bring shows up later in their dashboard, as counts, not as our promise.
const PLANS = [
  { name: 'Starter', price: 99 },
  { name: 'Branded', price: 199 },
  { name: 'Growth', price: 349 },
] as const;
const PICKS: Treat[] = ['mint', 'sugar', 'biscuit', 'honey'];

/** "50 de cafele" / "2 cafele" / "o cafea"; "50 coffees" / "1 coffee". */
function coffees(lang: 'ro' | 'en', n: number): string {
  if (lang === 'en') return `${n.toLocaleString('en-US')} ${n === 1 ? 'coffee' : 'coffees'}`;
  if (n === 1) return 'o cafea';
  const r = n % 100;
  return `${n.toLocaleString('ro-RO')} ${n >= 20 && (r === 0 || r >= 20) ? 'de cafele' : 'cafele'}`;
}

export default function BreakEven() {
  const { t, lang } = useT();
  const [perDay, setPerDay] = useState(String(COFFEES_PER_DAY));
  const [plan, setPlan] = useState<number>(PLANS[0].price);
  const [treat, setTreat] = useState<Treat>('mint');

  const d = Math.max(0, Number(perDay) || 0);
  const lei = perCoffeeLei(plan, d);
  const cmp = lei !== null ? compareTo(lei, treat) : null;
  const a = t(`treat.${treat}`);
  const said =
    cmp === null
      ? null
      : cmp.kind === 'times'
        ? t('cmp.times', { n: lang === 'ro' && cmp.n >= 20 ? `${cmp.n} de` : String(cmp.n), pl: t(`treat.${treat}.pl`) })
        : t(cmp.kind === 'less' ? 'cmp.less' : 'cmp.same', { a });
  // Rounded up to the ban (cent), like the per-coffee amount, so the two
  // never disagree at one coffee a day.
  const perDayCost =
    lang === 'en'
      ? `$${(Math.ceil((toUsd(plan) / 30) * 100) / 100).toFixed(2)}`
      : `${(Math.ceil((plan / 30) * 100) / 100).toFixed(2).replace('.', ',')} lei`;

  const field = 'rounded-2xl border border-ink/15 bg-paper-2 px-4 py-3 font-display text-2xl font-bold text-ink focus:border-brand focus:outline-none';

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
          <label htmlFor="calc-day" className="block text-sm font-semibold text-ink-2">
            {t('calc.perday')}
            <input
              id="calc-day"
              inputMode="numeric"
              value={perDay}
              onChange={(e) => setPerDay(e.target.value.replace(/\D/g, '').slice(0, 4))}
              autoComplete="off"
              className={`${field} mt-1.5 w-full`}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold text-ink-2">{t('calc.treat')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PICKS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={treat === k}
                  onClick={() => setTreat(k)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    treat === k ? 'border-brand bg-brand text-white' : 'border-ink/15 bg-paper-2 text-ink hover:border-ink/35'
                  }`}
                >
                  {t(`calc.pick.${k}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-ink-2">{t('calc.plan')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PLANS.map(({ name, price: v }) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={plan === v}
                  onClick={() => setPlan(v)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    plan === v ? 'border-brand bg-brand text-white' : 'border-ink/15 bg-paper-2 text-ink hover:border-ink/35'
                  }`}
                >
                  {name} · {t('calc.planv', { n: priceNumber(lang, v) })}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col justify-center rounded-3xl bg-brand-deep p-6 text-white shadow-soft sm:p-8" aria-live="polite">
          {lei === null ? (
            <p className="text-lg text-white/85">{t('calc.empty')}</p>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-white/80">{t('calc.need')}</p>
              {said && (
                <>
                  <p className="mt-2 text-balance font-display text-[2.4rem] font-bold leading-[1.05] tracking-tight text-brand-amber sm:text-[3rem]">
                    {said.charAt(0).toUpperCase() + said.slice(1)}
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-snug">{t('calc.already')}</p>
                </>
              )}
              {/* What the small cost buys, from features that exist today. */}
              <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-white/90">{t('calc.value')}</p>
              <p className="mt-2 max-w-[42ch] text-[13px] leading-relaxed text-white/70">
                {t('calc.then', { c: formatPerCoffee(lang, lei), plan: priceNumber(lang, plan), d: perDayCost, n: coffees(lang, d) })}
              </p>
            </>
          )}
          <p className="mt-6 border-t border-white/10 pt-4 text-[12px] leading-relaxed text-white/60">{t('calc.note')}</p>
        </div>
      </div>
    </section>
  );
}
