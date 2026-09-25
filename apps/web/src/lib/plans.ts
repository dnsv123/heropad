// The packages, as sold. One file, one source of truth for what a plan
// includes and what it costs — Admin reads it to configure a venue in one
// tap, and the How-to reads it so the story told at the counter matches
// the button that gets pressed afterwards.
//
// Prices are in lei/month, VAT not applicable (the company is not a VAT
// payer). Changing a price here changes it for NEW applications only; a
// venue keeps the fee and addon prices it was given (they are stored on the
// row at apply time) — nobody's bill moves because a constant moved.

export type PlanKey = 'starter' | 'branded' | 'growth' | 'chain' | 'founding';

export type BillingPeriod = 'monthly' | 'annual';

/**
 * Annual = pay for ten months, get twelve. Said as "2 luni gratis", never as
 * a percentage: two free months are understood at a counter, 16.7% is not.
 * One invoice a year, in the month the venue went active.
 */
export const ANNUAL_MONTHS_PAID = 10;

export function annualPrice(monthly: number): number {
  return monthly * ANNUAL_MONTHS_PAID;
}

export interface PlanDef {
  key: PlanKey;
  name: string;
  price: number;
  /** Team accounts included. */
  seats: number;
  /** One line for the button. */
  tagline: string;
  /** What the café gets. Shown under the button, said across the counter. */
  features: string[];
  /** What to physically prepare before/at install. */
  prepare: string[];
  /** Free pilot length, days. 0 = none. */
  trialDays: number;
}

export const PLANS: PlanDef[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: 99,
    seats: 2,
    tagline: 'Sistemul complet, fără figurină.',
    trialDays: 30,
    features: [
      'Card de fidelitate digital — ștampile, recompensă, cod unic la casă',
      'Kit QR pentru tejghea (stand + cod)',
      'Statistici live: clienți unici, rată de revenire, recompense date',
      '2 conturi de angajat cu istoric pe nume',
      'Pașaportul SuperVictor — localul apare pe harta clienților',
      'Clienți nelimitați',
    ],
    prepare: [
      'Creezi localul în Admin → primești codul de setup de 8 caractere',
      'Printezi standul QR (link în How-to → „De unde iau fiecare link")',
      'Patronul intră pe /business cu Gmail-ul lui și introduce codul o dată',
      'Setați împreună: câte ștampile → ce recompensă',
    ],
  },
  {
    key: 'branded',
    name: 'Branded',
    price: 199,
    seats: 3,
    tagline: 'Starter + figurina NFC + brandul lor pe card.',
    trialDays: 30,
    features: [
      'Tot din Starter',
      'Figurina SuperVictor cu NFC pe tejghea — tap = check-in instant, zero tastare',
      'Co-branding: logo-ul și culorile localului pe cardul clientului',
      'Vitrina BITS pe tejghea + setul de start: 20 de pin-uri SuperVictor, incluse (nu gratis, incluse) la plata anuală sau după 3 luni plătite',
      '3 conturi de angajat',
    ],
    prepare: [
      'Tot ce e la Starter',
      'Figurina cu sticker NTAG424 scris pe URL-ul localului (?tap=1)',
      'Logo-ul lor în PNG/SVG + culoarea principală (hex) → Setări local',
      'Vitrina + setul de start din Admin → Orders: la plata anuală imediat, la plata lunară după a 3-a factură plătită',
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    price: 349,
    seats: 5,
    tagline: 'Branded + motorul de creștere.',
    trialDays: 30,
    features: [
      'Tot din Branded',
      'Happy Hour ×2/×3 — ștampile multiplicate în intervalul ales',
      'Invitație la recenzie Google exact în momentul recompensei',
      'Surprize de zi de naștere (clientul alege să spună ziua; localul vede doar „azi")',
      '„Ce se întâmplă săptămâna asta" — anunțul localului pe cardul clienților',
      'Analitice avansate: pe angajat, pe zi, pe sursă (figurină vs QR)',
      '5 conturi de angajat',
    ],
    prepare: [
      'Tot ce e la Branded',
      'Link-ul de recenzie Google al localului (g.page/r/...) → Setări',
      'Intervalul de Happy Hour + zilele → Setări',
    ],
  },
  {
    key: 'chain',
    name: 'Chain',
    price: 699,
    seats: 12,
    tagline: '3+ locații, un singur raport.',
    trialDays: 30,
    features: [
      'Tot din Growth, la fiecare locație',
      'Raport consolidat pe lanț + pe locație',
      'Cardul clientului valabil la toate locațiile (o singură ștampilă, oriunde)',
      '12 conturi de angajat, distribuite cum vor',
      'Un singur abonament, o singură factură',
    ],
    prepare: [
      'Un local în Admin per locație, cu același prefix în slug (ex. brand-centru, brand-mall)',
      'Figurină + vitrină la fiecare locație',
      'Persoana de contact a lanțului = owner pe toate',
    ],
  },
  {
    key: 'founding',
    name: 'Founding Partner',
    price: 99,
    seats: 5,
    tagline: 'Primele 3 din Sibiu: tot Growth, la preț de Starter, pe viață.',
    trialDays: 60,
    features: [
      'Tot din Growth',
      'Figurina SuperVictor cu NFC inclusă',
      'CADOU: vitrina BITS + primele 20 de pin-uri SuperVictor — la fondatori e cadou, nu „inclus"',
      '99 lei/lună PE VIAȚĂ, cât timp rămân activi — scris în contract',
      'Numele lor pe landing la „Founding Partners"',
    ],
    prepare: [
      'Tot ce e la Growth',
      'Contractul cu clauza founding (99 lei net, comodat figurină)',
      'O poză cu patronul + localul pentru landing',
    ],
  },
];

export interface AddonDef {
  key: string;
  label: string;
  price: number;
  /** Per month unless `once`. */
  once?: boolean;
  hint: string;
}

export const ADDONS: AddonDef[] = [
  {
    key: 'extra_seat',
    label: 'Cont de angajat în plus',
    price: 20,
    hint: 'Peste cele incluse în plan. Se poate lua de mai multe ori.',
  },
  {
    key: 'second_figurine',
    label: 'A doua figurină NFC',
    price: 15,
    hint: 'Pentru localuri cu două case sau o terasă separată.',
  },
  {
    key: 'custom_trophy',
    label: 'Trofeu digital cu designul lor',
    price: 49,
    hint: 'Trofeul de card completat poartă brandul localului, nu doar SuperVictor.',
  },
  // Physical items are priced from the real landed cost (Vograce order of
  // Sept 2026, shipping and 21% import VAT included, the company is not a
  // VAT payer) and never below cost × 1.4. A pin on reorder lands at ~14 lei;
  // a new design's first 55 at ~25 lei, the mold (~86 $) being inside.
  // The sheet: _private/PRETURI_VOGRACE.md.
  {
    key: 'pin_pack',
    label: 'Pachet de 25 de pin-uri SuperVictor',
    price: 600,
    once: true,
    hint: 'Un model din catalogul nostru, 25 de bucăți, 24 lei/pin. Se ține în Orders.',
  },
  {
    key: 'cobranded_pin_55',
    label: 'Pin-ul lor: 55 buc, prima comandă',
    price: 1950,
    once: true,
    hint: 'Logo-ul localului pe pin. Include MATRIȚA (forma metalică, ~400 lei, se face o singură dată). Cea mai mică comandă posibilă.',
  },
  {
    key: 'cobranded_pin',
    label: 'Pin-ul lor: 100 buc, prima comandă',
    price: 2750,
    once: true,
    hint: 'Logo-ul localului pe pin, cu matrița inclusă. Recomanda de 100: 1.990 lei.',
  },
  {
    key: 'cobranded_pin_reorder',
    label: 'Pin-ul lor: 100 buc, recomandă',
    price: 1990,
    once: true,
    hint: 'Același design, matrița există deja (se păstrează 2 ani la fabrică), de aceea e mai ieftin.',
  },
];

export interface AppliedAddon {
  key: string;
  label: string;
  price: number;
  qty: number;
  once?: boolean;
}

/** Monthly total = plan base + recurring addons. One-off addons are excluded. */
export function monthlyTotal(plan: PlanDef, addons: AppliedAddon[]): number {
  return (
    plan.price +
    addons.filter((a) => !a.once).reduce((s, a) => s + a.price * a.qty, 0)
  );
}

export function planByKey(key: string | null | undefined): PlanDef | null {
  return PLANS.find((p) => p.key === key) ?? null;
}
