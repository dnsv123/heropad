import { RON_PER_USD } from './money';

// "What it costs per coffee": the monthly plan spread over the coffees a
// venue already sells, set next to the small things a café already gives
// away with every cup. It says what HeroPad costs, never how many customers
// must come back for it: a target reads as work the owner has to do.
//
// The comparisons are real prices per piece from Romanian HoReCa
// distributors, October 2026 (kfea.ro, hedonecafe.ro, universulcafelei.ro,
// herma.ro, dolcepausa.ro, bnb.ro, apisrom.ro, lumeacafelei.ro,
// horeca-trading-distribution.ro). A comparison is only said when it holds
// at the price range below, on the rounded-up amount the page shows.

/** Used on the pricing cards, said on the card next to the number. */
export const COFFEES_PER_DAY = 50;
const DAYS_PER_MONTH = 30;

/** Lei per piece, [cheapest, dearest] found. */
export const TREATS = {
  mint: [0.06, 0.24],
  sugar: [0.06, 0.12],
  biscuit: [0.23, 0.48],
  honey: [0.43, 0.61],
} as const;

export type Treat = keyof typeof TREATS;
export type Comparison = { kind: 'less' | 'same'; treat: Treat } | { kind: 'times'; treat: Treat; n: number };

/** Lei per coffee, or null when nothing is sold. */
export function perCoffeeLei(monthlyLei: number, perDay: number): number | null {
  return perDay > 0 ? monthlyLei / (perDay * DAYS_PER_MONTH) : null;
}

const shown = (lei: number) => Math.ceil(lei * 100) / 100;

/** The cost said in pieces of what the venue already gives away. Below the
 *  cheapest piece: "less than one"; within the range: "about one"; above
 *  it: "about n", counted at the dearest price so n is never overstated. */
export function compareTo(lei: number, treat: Treat): Comparison {
  const [low, high] = TREATS[treat];
  const v = shown(lei);
  if (v < low) return { kind: 'less', treat };
  if (v <= high) return { kind: 'same', treat };
  return { kind: 'times', treat, n: Math.ceil(v / high) };
}

/** For the pricing cards: the mint when it holds, else the next dearer
 *  treat that does; null when the cost is above all of them. */
export function cardComparison(lei: number): Comparison | null {
  for (const treat of ['mint', 'biscuit', 'honey'] as const) {
    const c = compareTo(lei, treat);
    if (c.kind !== 'times') return c;
  }
  return null;
}

/** "7 bani" / "1,20 lei" in Romanian, "1.5¢" / "$0.30" in English, rounded up. */
export function formatPerCoffee(lang: 'ro' | 'en', lei: number): string {
  if (lang === 'en') {
    const cents = Math.ceil((lei / RON_PER_USD) * 1000) / 10;
    return cents < 100 ? `${cents.toFixed(1).replace(/\.0$/, '')}¢` : `$${(cents / 100).toFixed(2)}`;
  }
  const bani = Math.ceil(lei * 100);
  if (bani === 1) return 'un ban';
  // Romanian puts "de" between a number from 20 up and its noun.
  if (bani < 100) return `${bani} ${bani >= 20 ? 'de bani' : 'bani'}`;
  return `${(bani / 100).toFixed(2).replace('.', ',')} lei`;
}
