// Prices are set in lei. The English landing shows them in dollars so a
// reader abroad (a judge, an investor) gets a number they can feel; the
// Romanian landing shows lei because that is what the invoice says.
//
// One fixed rate, rounded to whole dollars. It is a reading aid, not a
// price list: the contract and the invoice are always in lei.
export const RON_PER_USD = 4.6;

export function toUsd(ron: number): number {
  return Math.round(ron / RON_PER_USD);
}

/** "99" → "$22" in English, "99" in Romanian (unit added by the caller). */
export function priceNumber(lang: 'ro' | 'en', ron: number): string {
  return lang === 'en' ? `$${toUsd(ron)}` : String(ron);
}
