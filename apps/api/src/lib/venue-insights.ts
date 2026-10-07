import { createHash } from 'node:crypto';

// The owner's deeper numbers, by plan. Pure functions over rows the caller
// has already read, so they can be tested without a database.
//
// The unit is a VISIT: one customer on one venue-local day. Stamps are not
// visits: Happy Hour grants two or three at once, and a big order can earn
// several. Counting visits keeps every number here about people coming in.
//
// PII-free by construction, like the rest of the dashboard: counts, venue
// staff labels the owner chose, and stable per-venue pseudonyms (never the
// customer's loyalty code, which the barista reads at the counter).

export type InsightTier = 'starter' | 'branded' | 'growth';

/** Which dashboard a plan opens. A venue with no plan set (pilots that
 *  predate plans) sees everything, like Chain and Founding. */
export function tierForPlan(plan: string | null | undefined): InsightTier {
  if (plan === 'starter') return 'starter';
  if (plan === 'branded') return 'branded';
  return 'growth';
}

export interface HappyHourWindow {
  /** Weekdays 0 (Sun) – 6 (Sat), as the counter evaluates them. */
  days: number[];
  start: string;
  end: string;
  mult: number;
}

export interface InsightInput {
  venueId: string;
  tier: InsightTier;
  timeZone: string;
  now: number;
  ownerIdentityId: string | null;
  stamps: Array<{ user_identity_id: string; created_at: string; granted_by?: string | null; source?: string | null }>;
  /** Stamps already spent on rewards, per customer. */
  consumedByCustomer: Map<string, number>;
  /** Branded and up: earliest stamp at ANOTHER venue, per customer (ms). */
  otherFirstStamp?: Map<string, number>;
  /** Branded and up: BITS shelf items handed over at this counter. */
  shelfClaims?: Array<{ name: string; fulfilledAt: string }>;
  /** Branded and up: staff identity → the label the owner gave them. */
  staffNames?: Map<string, string>;
  /** Growth: customers who told us their birthday. */
  birthdays?: Map<string, { day: number; month: number }>;
  /** Growth: the venue's current Happy Hour, if it has one. */
  happyHour?: HappyHourWindow | null;
}

export interface Ratio {
  returned: number;
  /** Customers old enough to have had the whole window. */
  eligible: number;
}

export interface VenueInsights {
  tier: InsightTier;
  /** Came on 2+ days, and not in the last 30. */
  lapsed: number;
  /** Of those, how many still have stamps waiting on their card. */
  lapsedWithStamps: number;
  /** Median days between two visits of the same customer. */
  medianReturnDays: number | null;
  /** Visits (customer-days) in the last 30 days. */
  visits30: number;
  branded: null | {
    /** Customers whose first HeroPad stamp anywhere was at another venue. */
    passportArrivals: number;
    shelf: { total: number; last30: number; top: Array<{ name: string; count: number }> };
    /** `code` is the loyalty code the staff reads at the counter (filled in by the
     *  caller); `who` is internal and is removed before the response leaves. */
    loyal: Array<{ tag: string; code?: string | null; who?: string; visits: number; lastVisit: string; onCard: number }>;
    /** Last 30 days, per person at the counter. label: 'owner' | 'unknown' | 'former' | staff name. */
    staff30: Array<{ label: string; stamps: number; visits: number }>;
  };
  growth: null | {
    cohorts: Array<{ month: string; newCustomers: number; r30: Ratio; r60: Ratio; r90: Ratio }>;
    /** Last 30 days, stamps by how they were given. */
    sources30: Array<{ source: string; stamps: number }>;
    happyHour: null | {
      days: number[];
      start: string;
      end: string;
      mult: number;
      /** Last 30 days: visits inside the window on Happy Hour days, and how many such days there were. */
      visits30: number;
      hhDays: number;
      /** The same hours on the days WITHOUT Happy Hour (otherDays 0 = every day has it). */
      otherVisits30: number;
      otherDays: number;
    };
    birthdays: { known: number; thisMonth: number; cameOnBirthday: number };
    /** Up to a year of days with activity, for the CSV export. */
    daily365: Array<{ day: string; customers: number; newCustomers: number; stamps: number }>;
  };
}

const DAY = 24 * 60 * 60 * 1000;
const WD_SUN0: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function formatter(timeZone: string): Intl.DateTimeFormat {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone });
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'Europe/Bucharest' });
  }
}

interface Local {
  day: string;
  month: string;
  wd: number;
  hm: string;
}

function local(fmt: Intl.DateTimeFormat, ms: number): Local {
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = String(Number(get('hour')) % 24).padStart(2, '0');
  const y = get('year');
  const m = get('month');
  return { day: `${y}-${m}-${get('day')}`, month: `${y}-${m}`, wd: WD_SUN0[get('weekday')] ?? 0, hm: `${hour}:${get('minute')}` };
}

/** Whole days from a to b, both 'YYYY-MM-DD'. */
export function dayDiff(a: string, b: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / DAY);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((x, y) => x - y);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Same rule as the counter: a window that crosses midnight wraps. */
export function inWindow(hm: string, start: string, end: string): boolean {
  return start <= end ? start <= hm && hm < end : hm >= start || hm < end;
}

/** A short, stable name for a customer, per venue. Cannot be turned back
 *  into the loyalty code or the identity. */
export function pseudonym(venueId: string, identityId: string): string {
  return '#' + createHash('sha256').update(`${venueId}:${identityId}`).digest('hex').slice(0, 4).toUpperCase();
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function computeInsights(input: InsightInput): VenueInsights {
  const { venueId, tier, now, ownerIdentityId } = input;
  const fmt = formatter(input.timeZone);
  const today = local(fmt, now);
  const cutoff30 = local(fmt, now - 30 * DAY).day;
  const cutoff365 = local(fmt, now - 365 * DAY).day;
  const since30 = now - 30 * DAY;

  // One pass over the stamps: who came on which days, and what each visit
  // looked like (first stamp time of that customer-day decides the window).
  const days = new Map<string, Set<string>>();
  const firstMs = new Map<string, number>();
  const totals = new Map<string, number>();
  const visitTime = new Map<string, Local>(); // key who|day → earliest local time that day
  const byDay = new Map<string, { stamps: number; customers: Set<string> }>();
  const staff = new Map<string, { stamps: number; visits: Set<string> }>();
  const sources = new Map<string, number>();

  for (const s of input.stamps) {
    const ms = new Date(s.created_at).getTime();
    const l = local(fmt, ms);
    const who = s.user_identity_id;
    if (!days.has(who)) days.set(who, new Set());
    days.get(who)!.add(l.day);
    if (!firstMs.has(who) || ms < firstMs.get(who)!) firstMs.set(who, ms);
    totals.set(who, (totals.get(who) ?? 0) + 1);
    const key = `${who}|${l.day}`;
    const seen = visitTime.get(key);
    if (!seen || l.hm < seen.hm) visitTime.set(key, l);
    if (!byDay.has(l.day)) byDay.set(l.day, { stamps: 0, customers: new Set() });
    const d = byDay.get(l.day)!;
    d.stamps += 1;
    d.customers.add(who);
    if (ms >= since30) {
      const g = s.granted_by ?? null;
      const label =
        g === null ? 'unknown' : g === ownerIdentityId ? 'owner' : input.staffNames?.get(g) ?? 'former';
      if (!staff.has(label)) staff.set(label, { stamps: 0, visits: new Set() });
      const st = staff.get(label)!;
      st.stamps += 1;
      st.visits.add(key);
      const src = s.source ?? 'merchant';
      sources.set(src, (sources.get(src) ?? 0) + 1);
    }
  }

  const sorted = new Map<string, string[]>();
  for (const [who, set] of days) sorted.set(who, [...set].sort());
  const current = (who: string) => Math.max(0, (totals.get(who) ?? 0) - (input.consumedByCustomer.get(who) ?? 0));

  // --- Starter ---------------------------------------------------------------
  let lapsed = 0;
  let lapsedWithStamps = 0;
  const gaps: number[] = [];
  let visits30 = 0;
  for (const [who, list] of sorted) {
    for (let i = 1; i < list.length; i++) gaps.push(dayDiff(list[i - 1], list[i]));
    for (const d of list) if (d >= cutoff30) visits30 += 1;
    if (list.length >= 2 && list[list.length - 1] < cutoff30) {
      lapsed += 1;
      if (current(who) > 0) lapsedWithStamps += 1;
    }
  }
  const med = median(gaps);

  const out: VenueInsights = {
    tier,
    lapsed,
    lapsedWithStamps,
    medianReturnDays: med === null ? null : Math.round(med),
    visits30,
    branded: null,
    growth: null,
  };
  if (tier === 'starter') return out;

  // --- Branded ---------------------------------------------------------------
  let passportArrivals = 0;
  for (const [who, here] of firstMs) {
    const other = input.otherFirstStamp?.get(who);
    if (other !== undefined && other < here) passportArrivals += 1;
  }
  const shelfCount = new Map<string, number>();
  let shelfLast30 = 0;
  for (const c of input.shelfClaims ?? []) {
    shelfCount.set(c.name, (shelfCount.get(c.name) ?? 0) + 1);
    if (new Date(c.fulfilledAt).getTime() >= since30) shelfLast30 += 1;
  }
  const loyal = [...sorted.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort(([, a], [, b]) => b.length - a.length || b[b.length - 1].localeCompare(a[a.length - 1]))
    .slice(0, 5)
    .map(([who, list]) => ({
      who,
      tag: pseudonym(venueId, who),
      visits: list.length,
      lastVisit: list[list.length - 1],
      onCard: current(who),
    }));
  out.branded = {
    passportArrivals,
    shelf: {
      total: input.shelfClaims?.length ?? 0,
      last30: shelfLast30,
      top: [...shelfCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count })),
    },
    loyal,
    staff30: [...staff.entries()]
      .map(([label, v]) => ({ label, stamps: v.stamps, visits: v.visits.size }))
      .sort((a, b) => b.visits - a.visits || b.stamps - a.stamps),
  };
  if (tier === 'branded') return out;

  // --- Growth ----------------------------------------------------------------
  const months: string[] = [];
  {
    const [y, m] = today.month.split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(Date.UTC(y, m - 1 - i, 15));
      months.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
    }
  }
  const zero = (): Ratio => ({ returned: 0, eligible: 0 });
  const cohorts = months.map((month) => ({ month, newCustomers: 0, r30: zero(), r60: zero(), r90: zero() }));
  for (const list of sorted.values()) {
    const first = list[0];
    const c = cohorts.find((x) => x.month === first.slice(0, 7));
    if (!c) continue;
    c.newCustomers += 1;
    const age = dayDiff(first, today.day);
    const back = (n: number) => list.some((d) => d > first && dayDiff(first, d) <= n);
    for (const [n, r] of [[30, c.r30], [60, c.r60], [90, c.r90]] as Array<[number, Ratio]>) {
      if (age >= n) {
        r.eligible += 1;
        if (back(n)) r.returned += 1;
      }
    }
  }

  let happyHour: NonNullable<VenueInsights['growth']>['happyHour'] = null;
  const hh = input.happyHour;
  if (hh && hh.days.length > 0) {
    let hhDays = 0;
    let otherDays = 0;
    for (let i = 0; i < 30; i++) {
      if (hh.days.includes(local(fmt, now - i * DAY).wd)) hhDays += 1;
      else otherDays += 1;
    }
    let inHH = 0;
    let inOther = 0;
    for (const v of visitTime.values()) {
      if (v.day < cutoff30 || !inWindow(v.hm, hh.start, hh.end)) continue;
      if (hh.days.includes(v.wd)) inHH += 1;
      else inOther += 1;
    }
    happyHour = {
      days: hh.days,
      start: hh.start,
      end: hh.end,
      mult: hh.mult,
      visits30: inHH,
      hhDays,
      otherVisits30: inOther,
      otherDays,
    };
  }

  let known = 0;
  let thisMonth = 0;
  let cameOnBirthday = 0;
  const monthNow = Number(today.month.slice(5));
  for (const [who, b] of input.birthdays ?? []) {
    if (!days.has(who)) continue;
    known += 1;
    if (b.month === monthNow) thisMonth += 1;
    const mmdd = `${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
    const hit = (sorted.get(who) ?? []).some((d) => {
      const y = Number(d.slice(0, 4));
      const want = mmdd === '02-29' && !isLeap(y) ? '02-28' : mmdd;
      return d.slice(5) === want;
    });
    if (hit) cameOnBirthday += 1;
  }

  const newByDay = new Map<string, number>();
  for (const list of sorted.values()) newByDay.set(list[0], (newByDay.get(list[0]) ?? 0) + 1);
  const daily365 = [...byDay.entries()]
    .filter(([d]) => d >= cutoff365)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ day, customers: d.customers.size, newCustomers: newByDay.get(day) ?? 0, stamps: d.stamps }));

  out.growth = {
    cohorts,
    sources30: [...sources.entries()].map(([source, stamps]) => ({ source, stamps })).sort((a, b) => b.stamps - a.stamps),
    happyHour,
    birthdays: { known, thisMonth, cameOnBirthday },
    daily365,
  };
  return out;
}
