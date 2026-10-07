import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp } from '../lib/contact';

// The deeper numbers in the owner's dashboard, opened by plan. The API sends
// only what the venue's plan includes (apps/api/src/lib/venue-insights.ts);
// a lower plan sees, at the end, what the next one adds.
//
// Every field is optional on purpose: the web app and the API deploy
// separately, and a dashboard must never go blank because one of them is a
// release behind.

export interface Ratio {
  returned: number;
  eligible: number;
}

export interface Insights {
  tier?: 'starter' | 'branded' | 'growth';
  lapsed?: number;
  lapsedWithStamps?: number;
  medianReturnDays?: number | null;
  visits30?: number;
  branded?: null | {
    passportArrivals?: number;
    shelf?: { total: number; last30: number; top: Array<{ name: string; count: number }> };
    loyal?: Array<{ tag: string; code?: string | null; visits: number; lastVisit: string; onCard: number }>;
    staff30?: Array<{ label: string; stamps: number; visits: number }>;
  };
  growth?: null | {
    cohorts?: Array<{ month: string; newCustomers: number; r30: Ratio; r60: Ratio; r90: Ratio }>;
    sources30?: Array<{ source: string; stamps: number }>;
    happyHour?: null | {
      days: number[];
      start: string;
      end: string;
      mult: number;
      visits30: number;
      hhDays: number;
      otherVisits30: number;
      otherDays: number;
    };
    birthdays?: { known: number; thisMonth: number; cameOnBirthday: number };
    daily365?: Array<{ day: string; customers: number; newCustomers: number; stamps: number }>;
  };
}

const locale = (lang: 'ro' | 'en') => (lang === 'ro' ? 'ro-RO' : 'en-GB');

function fmtDay(day: string, lang: 'ro' | 'en'): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale(lang), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function fmtMonth(month: string, lang: 'ro' | 'en'): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(locale(lang), { month: 'long', timeZone: 'UTC' });
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="font-display text-3xl font-bold leading-none text-white">{value}</p>
      <p className="mt-1.5 text-sm leading-snug text-slate-200">{label}</p>
      {sub && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{sub}</p>}
    </div>
  );
}

/** Starter and up: who comes back, and who stopped. */
export function StarterInsights({ ins }: { ins: Insights | undefined }) {
  const { t, lang } = useT();
  if (!ins || ins.lapsed === undefined) return null;
  const num = (n: number) => n.toLocaleString(locale(lang));
  const lapsed = ins.lapsed ?? 0;
  const med = ins.medianReturnDays ?? null;
  return (
    <div className="card-sm p-4 sm:p-5">
      <p className="font-display text-sm font-semibold text-white">{t('ins.st.title')}</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <Stat
          value={num(lapsed)}
          label={t('ins.st.lapsed')}
          sub={
            lapsed > 0 && (ins.lapsedWithStamps ?? 0) > 0
              ? t('ins.st.lapsed.stamps', { n: num(ins.lapsedWithStamps ?? 0) })
              : t('ins.st.lapsed.def')
          }
        />
        <Stat
          value={
            med === null
              ? '—'
              : med === 1
                ? t('ins.st.day1')
                : t(lang === 'ro' && med >= 20 && (med % 100 === 0 || med % 100 >= 20) ? 'ins.st.days.de' : 'ins.st.days', {
                    n: num(med),
                  })
          }
          label={t('ins.st.gap')}
          sub={med === null ? t('ins.st.gap.none') : t('ins.st.gap.def')}
        />
      </div>
      {ins.visits30 !== undefined && (
        <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] text-slate-400">
          {t('ins.st.visits30', { n: num(ins.visits30) })}
        </p>
      )}
    </div>
  );
}

const SOURCE_KEY: Record<string, 'ins.src.figurine' | 'ins.src.qr' | 'ins.src.code'> = {
  ntag_tap: 'ins.src.figurine',
  nfc: 'ins.src.figurine',
  qr: 'ins.src.qr',
  merchant: 'ins.src.code',
};

function pct(r: Ratio): string {
  return r.eligible > 0 ? `${Math.round((r.returned / r.eligible) * 100)}%` : '—';
}

function csvDownload(rows: NonNullable<NonNullable<Insights['growth']>['daily365']>, lang: 'ro' | 'en', slug: string) {
  // Excel in Romanian reads ';' as the column separator, English Excel ','.
  const sep = lang === 'ro' ? ';' : ',';
  const head =
    lang === 'ro' ? ['zi', 'clienti', 'clienti_noi', 'stampile'] : ['day', 'customers', 'new_customers', 'stamps'];
  const lines = [head.join(sep), ...rows.map((r) => [r.day, r.customers, r.newCustomers, r.stamps].join(sep))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `heropad-${slug || 'local'}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Branded, Growth, and what the next plan adds. */
export function PlanInsights({
  ins,
  slug = '',
  onCustomer,
}: {
  ins: Insights | undefined;
  slug?: string;
  /** Opens the History tab narrowed to this customer's code. */
  onCustomer?: (code: string) => void;
}) {
  const { t, lang } = useT();
  if (!ins || !ins.tier) return null;
  const num = (n: number) => n.toLocaleString(locale(lang));
  const b = ins.branded ?? null;
  const g = ins.growth ?? null;
  const staffLabel = (label: string) =>
    label === 'owner'
      ? t('ins.staff.owner')
      : label === 'unknown'
        ? t('ins.staff.unknown')
        : label === 'former'
          ? t('ins.staff.former')
          : label;
  const WD = [t('d.wd.7'), t('d.wd.1'), t('d.wd.2'), t('d.wd.3'), t('d.wd.4'), t('d.wd.5'), t('d.wd.6')]; // Sun = 0
  const next = ins.tier === 'starter' ? 'branded' : ins.tier === 'branded' ? 'growth' : null;

  return (
    <>
      {b && (
        <div className="card-sm p-4 sm:p-5">
          <p className="font-display text-sm font-semibold text-white">{t('ins.br.title')}</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Stat
              value={num(b.passportArrivals ?? 0)}
              label={t('ins.br.passport')}
              sub={t('ins.br.passport.def')}
            />
            <Stat
              value={num(b.shelf?.total ?? 0)}
              label={t('ins.br.shelf')}
              sub={t('ins.br.shelf.30', { n: num(b.shelf?.last30 ?? 0) })}
            />
          </div>
          {(b.shelf?.top?.length ?? 0) > 0 && (
            <p className="mt-3 text-[11px] text-slate-400">
              {t('ins.br.shelf.top')}{' '}
              {b.shelf!.top.map((x) => `${x.name} (${num(x.count)})`).join(', ')}
            </p>
          )}
        </div>
      )}

      {b && (b.loyal?.length ?? 0) > 0 && (
        <div className="card-sm p-4 sm:p-5">
          <p className="font-display text-sm font-semibold text-white">{t('ins.loyal.title')}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 font-medium">{t('ins.loyal.who')}</th>
                  <th className="py-1 text-right font-medium">{t('ins.loyal.visits')}</th>
                  <th className="py-1 text-right font-medium">{t('ins.loyal.last')}</th>
                  <th className="py-1 text-right font-medium">{t('ins.loyal.card')}</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {b.loyal!.map((c) => (
                  <tr key={c.code ?? c.tag} className="border-t border-white/[0.06]">
                    <td className="py-1.5 font-mono">
                      {c.code && onCustomer ? (
                        <button
                          type="button"
                          onClick={() => onCustomer(c.code as string)}
                          aria-label={t('ins.loyal.open', { code: c.code })}
                          className="font-mono text-hero-cyan underline decoration-hero-cyan/40 underline-offset-2 hover:text-white"
                        >
                          {c.code}
                        </button>
                      ) : (
                        c.code ?? c.tag
                      )}
                    </td>
                    <td className="py-1.5 text-right">{num(c.visits)}</td>
                    <td className="py-1.5 text-right">{fmtDay(c.lastVisit, lang)}</td>
                    <td className="py-1.5 text-right">{num(c.onCard)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            {t(b.loyal!.some((c) => c.code) ? 'ins.loyal.note.code' : 'ins.loyal.note')}
          </p>
        </div>
      )}

      {b && (b.staff30?.length ?? 0) > 0 && (
        <div className="card-sm p-4 sm:p-5">
          <p className="font-display text-sm font-semibold text-white">{t('ins.staff.title')}</p>
          <table className="mt-3 w-full text-left text-xs tabular-nums">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 font-medium">{t('ins.staff.who')}</th>
                <th className="py-1 text-right font-medium">{t('ins.loyal.visits')}</th>
                <th className="py-1 text-right font-medium">{t('ins.col.stamps')}</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {b.staff30!.map((s) => (
                <tr key={s.label} className="border-t border-white/[0.06]">
                  <td className="py-1.5">{staffLabel(s.label)}</td>
                  <td className="py-1.5 text-right">{num(s.visits)}</td>
                  <td className="py-1.5 text-right">{num(s.stamps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {g && (g.cohorts?.length ?? 0) > 0 && (
        <div className="card-sm p-4 sm:p-5">
          <p className="font-display text-sm font-semibold text-white">{t('ins.co.title')}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 font-medium">{t('ins.co.month')}</th>
                  <th className="py-1 text-right font-medium">{t('ins.co.new')}</th>
                  <th className="py-1 text-right font-medium">{t('ins.co.in', { n: 30 })}</th>
                  <th className="py-1 text-right font-medium">{t('ins.co.in', { n: 60 })}</th>
                  <th className="py-1 text-right font-medium">{t('ins.co.in', { n: 90 })}</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {g.cohorts!.map((c) => (
                  <tr key={c.month} className="border-t border-white/[0.06]">
                    <td className="py-1.5 capitalize">{fmtMonth(c.month, lang)}</td>
                    <td className="py-1.5 text-right">{num(c.newCustomers)}</td>
                    <td className="py-1.5 text-right">{pct(c.r30)}</td>
                    <td className="py-1.5 text-right">{pct(c.r60)}</td>
                    <td className="py-1.5 text-right">{pct(c.r90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{t('ins.co.note')}</p>
        </div>
      )}

      {g && (
        <div className="card-sm p-4 sm:p-5">
          <p className="font-display text-sm font-semibold text-white">{t('ins.hh.title')}</p>
          {g.happyHour ? (
            <>
              <p className="mt-1 text-[11px] text-slate-400">
                {g.happyHour.days.map((d) => WD[d]).join(', ')} · {g.happyHour.start}–{g.happyHour.end} · ×{g.happyHour.mult}
              </p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Stat
                  value={
                    g.happyHour.hhDays > 0
                      ? (g.happyHour.visits30 / g.happyHour.hhDays).toLocaleString(locale(lang), { maximumFractionDigits: 1 })
                      : '—'
                  }
                  label={t('ins.hh.in')}
                  sub={t('ins.hh.total', { n: num(g.happyHour.visits30) })}
                />
                <Stat
                  value={
                    g.happyHour.otherDays > 0
                      ? (g.happyHour.otherVisits30 / g.happyHour.otherDays).toLocaleString(locale(lang), {
                          maximumFractionDigits: 1,
                        })
                      : '—'
                  }
                  label={t('ins.hh.out')}
                  sub={g.happyHour.otherDays > 0 ? t('ins.hh.out.def') : t('ins.hh.every')}
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{t('ins.hh.note')}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-300">{t('ins.hh.none')}</p>
          )}
        </div>
      )}

      {g && g.birthdays && (
        <div className="card-sm p-4 sm:p-5">
          <p className="font-display text-sm font-semibold text-white">{t('ins.bd.title')}</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat value={num(g.birthdays.known)} label={t('ins.bd.known')} />
            <Stat value={num(g.birthdays.thisMonth)} label={t('ins.bd.month')} />
            <Stat value={num(g.birthdays.cameOnBirthday)} label={t('ins.bd.came')} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{t('ins.bd.note')}</p>
        </div>
      )}

      {g && (g.sources30?.length ?? 0) > 0 && (
        <div className="card-sm p-4 sm:p-5">
          <p className="font-display text-sm font-semibold text-white">{t('ins.src.title')}</p>
          {(() => {
            const merged = new Map<string, number>();
            for (const s of g.sources30!) {
              const k = SOURCE_KEY[s.source] ?? 'ins.src.code';
              merged.set(k, (merged.get(k) ?? 0) + s.stamps);
            }
            const total = [...merged.values()].reduce((a, v) => a + v, 0) || 1;
            return (
              <ul className="mt-3 space-y-2">
                {[...merged.entries()]
                  .sort((x, y) => y[1] - x[1])
                  .map(([k, v]) => (
                    <li key={k}>
                      <div className="flex justify-between text-xs text-slate-200">
                        <span>{t(k as 'ins.src.qr')}</span>
                        <span className="tabular-nums">
                          {num(v)} · {Math.round((v / total) * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/[0.06]">
                        <div className="h-1.5 rounded-full bg-[#1F95CF]" style={{ width: `${(v / total) * 100}%` }} />
                      </div>
                    </li>
                  ))}
              </ul>
            );
          })()}
        </div>
      )}

      {g && (g.daily365?.length ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => csvDownload(g.daily365!, lang, slug)}
          className="btn btn-secondary btn-sm w-full"
        >
          {t('ins.csv')}
        </button>
      )}

      {next && (
        <div className="rounded-2xl border border-dashed border-hero-gold/40 p-4 sm:p-5">
          <p className="font-display text-sm font-semibold text-white">
            {t(next === 'branded' ? 'ins.up.branded' : 'ins.up.growth')}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {t(next === 'branded' ? 'ins.up.branded.list' : 'ins.up.growth.list')
              .split(' · ')
              .map((x) => (
                <li key={x} className="flex gap-2">
                  <span aria-hidden className="text-hero-gold">+</span>
                  {x}
                </li>
              ))}
          </ul>
          <a
            href={contactHref()}
            target={contactIsWhatsApp() ? '_blank' : undefined}
            rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
            className="btn btn-secondary btn-sm mt-4"
          >
            {t('ins.up.cta')}
          </a>
        </div>
      )}
    </>
  );
}
