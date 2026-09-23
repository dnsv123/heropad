import { useMemo, useState } from 'react';

import { useT } from '../i18n';

// The owner's dashboard (Business → Statistics). One question per block:
//   Are more people coming?        → the hero number, last 30 days, with delta
//   Are they coming back?          → the daily columns, returning vs new
//   When do they come?             → the week × hour grid (Happy Hour goes
//                                    in the quiet hours, not the busy ones)
//   Who is about to earn a reward? → distance to the reward, and who is close
//
// Plain HTML and CSS, no chart library: it has to open instantly on the
// barista's phone. Colours are validated for the navy surface (dataviz
// validator, dark mode, surface #0F2450): returning #1F95CF, new #C48316,
// the grid a single cyan ramp. Every value is also in the table view.

export interface OwnerAnalytics {
  uniqueCustomers: number;
  totalStamps: number;
  stampsLast30: number;
  stampsPrev30?: number;
  customers30?: number;
  customersPrev30?: number;
  rewardsClaimed: number;
  milestonesClaimed?: number;
  repeatCustomers: number;
  trophiesMinted: number;
  series30?: Array<{ day: string; stamps: number; newCustomers: number; returning: number }>;
  heat?: number[][];
  progress: { early: number; mid: number; almost: number; full: number };
  nearReward?: number;
  timeZone?: string;
}

const C_RETURN = '#1F95CF';
const C_NEW = '#C48316';
// Single-hue ramp for the grid: empty cell is one step off the card.
const HEAT = ['#15306A', '#1B4B84', '#1E6AA3', '#2891C6', '#5DD3FF'];

function fmtDay(day: string, lang: 'ro' | 'en', opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', {
    ...opts,
    timeZone: 'UTC',
  });
}

function Delta({ now, prev, lang }: { now: number; prev: number | undefined; lang: 'ro' | 'en' }) {
  const { t } = useT();
  if (prev === undefined) return null;
  if (prev === 0 && now === 0) return <span className="text-xs text-slate-500">{t('d.delta.none')}</span>;
  if (prev === 0) return <span className="text-xs font-semibold text-emerald-300">▲ {t('d.delta.new')}</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  const cls = pct > 0 ? 'text-emerald-300' : pct < 0 ? 'text-rose-300' : 'text-slate-400';
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
  return (
    <span className={`text-xs font-semibold ${cls}`}>
      {arrow} {Math.abs(pct).toLocaleString(lang === 'ro' ? 'ro-RO' : 'en-GB')}% <span className="font-normal text-slate-500">{t('d.delta.vs')}</span>
    </span>
  );
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

export default function OwnerDashboard({ a, required }: { a: OwnerAnalytics; required: number }) {
  const { t, lang } = useT();
  const [hover, setHover] = useState<number | null>(null);
  const [heatHover, setHeatHover] = useState<{ d: number; h: number } | null>(null);

  const series = a.series30 ?? [];
  const repeatPct = a.uniqueCustomers > 0 ? Math.round((a.repeatCustomers / a.uniqueCustomers) * 100) : null;
  const yMax = niceMax(Math.max(1, ...series.map((s) => s.newCustomers + s.returning)));
  const ticks = Number.isInteger(yMax / 2) ? [0, yMax / 2, yMax] : [0, yMax];

  const WD = [t('d.wd.1'), t('d.wd.2'), t('d.wd.3'), t('d.wd.4'), t('d.wd.5'), t('d.wd.6'), t('d.wd.7')];

  // The grid shows the hours the venue actually works (any stamp ever),
  // widened to at least 8:00–20:00 so a new venue still reads as a day.
  const heatView = useMemo(() => {
    const heat = a.heat ?? [];
    if (heat.length !== 7) return null;
    const hourTotals = Array.from({ length: 24 }, (_, h) => heat.reduce((s, row) => s + (row[h] ?? 0), 0));
    const active = hourTotals.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0);
    const from = Math.min(8, ...(active.length ? active : [8]));
    const to = Math.max(20, ...(active.length ? active : [20]));
    const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const max = Math.max(0, ...heat.flat());
    let busiest: { d: number; h: number; v: number } | null = null;
    heat.forEach((row, d) =>
      row.forEach((v, h) => {
        if (v > 0 && (!busiest || v > busiest.v)) busiest = { d, h, v };
      })
    );
    // Quietest hour inside the working day, as a Happy Hour suggestion. The
    // first and last active hours are left out (opening and closing are
    // quiet for reasons a promotion will not fix), and so is any hour with
    // almost nothing, which is usually just an hour the venue is shut.
    let quiet: number | null = null;
    const peakHour = Math.max(0, ...hourTotals);
    const inside = active.slice(1, -1).filter((h) => hourTotals[h] >= peakHour * 0.15);
    if (inside.length >= 3) {
      quiet = inside.reduce((best, h) => (hourTotals[h] < hourTotals[best] ? h : best), inside[0]);
    }
    return { heat, hours, max, busiest: busiest as { d: number; h: number; v: number } | null, quiet };
  }, [a.heat]);

  const level = (v: number, max: number) => (v <= 0 || max <= 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.999)));

  const buckets = [
    { k: 'early', v: a.progress.early, l: t('b.stats.starting') },
    { k: 'mid', v: a.progress.mid, l: t('b.stats.halfway') },
    { k: 'almost', v: a.progress.almost, l: t('b.stats.almost') },
    { k: 'full', v: a.progress.full, l: t('b.stats.full') },
  ];
  const bMax = Math.max(1, ...buckets.map((b) => b.v));
  const num = (n: number) => n.toLocaleString(lang === 'ro' ? 'ro-RO' : 'en-GB');

  if (a.uniqueCustomers === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-6 text-center">
        <p className="font-display text-lg font-semibold text-white">{t('d.empty.t')}</p>
        <p className="mt-1 text-sm text-slate-400">{t('d.empty.d')}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* The one number: people in the last 30 days, and which way it moves. */}
      <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr]">
        <div className="card-sm p-4 sm:p-5">
          <p className="text-xs text-slate-400">{t('d.hero')}</p>
          <p className="mt-1 font-display text-5xl font-bold leading-none text-white">{num(a.customers30 ?? 0)}</p>
          <p className="mt-2">
            <Delta now={a.customers30 ?? 0} prev={a.customersPrev30} lang={lang} />
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card-sm p-3.5">
            <p className="text-[11px] leading-tight text-slate-400">{t('d.tile.repeat')}</p>
            <p className="mt-1 font-display text-2xl font-bold text-white">{repeatPct === null ? '—' : `${repeatPct}%`}</p>
            <p className="text-[11px] text-slate-500">{t('d.tile.repeat.of', { n: num(a.uniqueCustomers) })}</p>
          </div>
          <div className="card-sm p-3.5">
            <p className="text-[11px] leading-tight text-slate-400">{t('d.tile.stamps')}</p>
            <p className="mt-1 font-display text-2xl font-bold text-white">{num(a.stampsLast30)}</p>
            <Delta now={a.stampsLast30} prev={a.stampsPrev30} lang={lang} />
          </div>
          <div className="card-sm col-span-2 flex items-center justify-between gap-3 p-3.5">
            <div>
              <p className="text-[11px] text-slate-400">{t('d.tile.rewards')}</p>
              <p className="mt-0.5 font-display text-2xl font-bold text-white">{num(a.rewardsClaimed)}</p>
            </div>
            <p className="text-right text-[11px] leading-relaxed text-slate-400">
              {t('d.tile.milestones', { n: num(a.milestonesClaimed ?? 0) })}
              <br />
              {t('d.tile.trophies', { n: num(a.trophiesMinted) })}
            </p>
          </div>
        </div>
      </div>

      {/* Customers per day, returning under new: the loyalty is the dark
          part growing. One axis, clean ticks, hover for the day. */}
      {series.length > 0 && (
        <figure className="card-sm p-4 sm:p-5">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-display text-sm font-semibold text-white">{t('d.chart.title')}</span>
            <span className="flex items-center gap-3 text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C_RETURN }} />
                {t('d.legend.returning')}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C_NEW }} />
                {t('d.legend.new')}
              </span>
            </span>
          </figcaption>

          <div className="relative mt-4 flex gap-2">
            {/* y ticks */}
            <div className="flex h-36 w-6 shrink-0 flex-col justify-between text-right text-[10px] tnum text-slate-500">
              {[...ticks].reverse().map((v) => (
                <span key={v} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
                  {num(v)}
                </span>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              {/* gridlines */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-36">
                {ticks.map((v) => (
                  <div key={v} className="absolute inset-x-0 h-px bg-white/[0.07]" style={{ bottom: `${(v / yMax) * 100}%` }} />
                ))}
              </div>
              <div className="relative flex h-36 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
                {series.map((s, i) => {
                  const total = s.newCustomers + s.returning;
                  return (
                    <button
                      type="button"
                      key={s.day}
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      aria-label={`${fmtDay(s.day, lang, { day: 'numeric', month: 'long' })}: ${s.returning} ${t('d.legend.returning')}, ${s.newCustomers} ${t('d.legend.new')}, ${s.stamps} ${t('d.tt.stamps')}`}
                      className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end focus:outline-none"
                    >
                      <span
                        className={`flex w-full max-w-[16px] flex-col-reverse transition-opacity ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                        style={{ height: `${(total / yMax) * 100}%` }}
                      >
                        {s.returning > 0 && (
                          <span className="block w-full rounded-b-none" style={{ background: C_RETURN, flexGrow: s.returning, borderRadius: s.newCustomers > 0 ? '0' : '4px 4px 0 0' }} />
                        )}
                        {s.newCustomers > 0 && s.returning > 0 && <span className="block h-[2px] shrink-0" />}
                        {s.newCustomers > 0 && (
                          <span className="block w-full" style={{ background: C_NEW, flexGrow: s.newCustomers, borderRadius: '4px 4px 0 0' }} />
                        )}
                      </span>
                      {total === 0 && <span className="block h-[2px] w-full max-w-[16px] rounded-full bg-white/[0.08]" />}
                    </button>
                  );
                })}
              </div>
              {/* x labels: first, every 7th, last */}
              <div className="relative mt-2 h-4 text-[10px] text-slate-500">
                {series.map((s, i) =>
                  i % 7 === 0 || i === series.length - 1 ? (
                    <span
                      key={s.day}
                      className="absolute whitespace-nowrap"
                      style={{
                        left: `${((i + 0.5) / series.length) * 100}%`,
                        transform: i === 0 ? 'translateX(-20%)' : i === series.length - 1 ? 'translateX(-80%)' : 'translateX(-50%)',
                      }}
                    >
                      {fmtDay(s.day, lang, { day: 'numeric', month: 'short' })}
                    </span>
                  ) : null
                )}
              </div>
              {hover !== null && series[hover] && (
                <div
                  className="pointer-events-none absolute top-0 z-10 w-40 rounded-xl border border-white/15 bg-hero-deep px-3 py-2 text-[11px] text-slate-300 shadow-xl"
                  style={{
                    left: `${Math.min(Math.max(((hover + 0.5) / series.length) * 100, 18), 82)}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <p className="font-semibold text-white">{fmtDay(series[hover].day, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                  <p className="mt-1 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: C_RETURN }} />{t('d.legend.returning')}</span>
                    <b className="tnum text-white">{series[hover].returning}</b>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: C_NEW }} />{t('d.legend.new')}</span>
                    <b className="tnum text-white">{series[hover].newCustomers}</b>
                  </p>
                  <p className="flex items-center justify-between gap-2 text-slate-400">
                    <span>{t('d.tt.stamps')}</span>
                    <b className="tnum text-slate-200">{series[hover].stamps}</b>
                  </p>
                </div>
              )}
            </div>
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">{t('d.table')}</summary>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="w-full text-left text-[11px] text-slate-300">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 font-medium">{t('d.th.day')}</th>
                    <th className="py-1 text-right font-medium">{t('d.legend.returning')}</th>
                    <th className="py-1 text-right font-medium">{t('d.legend.new')}</th>
                    <th className="py-1 text-right font-medium">{t('d.tt.stamps')}</th>
                  </tr>
                </thead>
                <tbody className="tnum">
                  {[...series].reverse().map((s) => (
                    <tr key={s.day} className="border-t border-white/[0.06]">
                      <td className="py-1">{fmtDay(s.day, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                      <td className="py-1 text-right">{s.returning}</td>
                      <td className="py-1 text-right">{s.newCustomers}</td>
                      <td className="py-1 text-right">{s.stamps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </figure>
      )}

      {/* When they come: weekday × hour, on the venue's clock. */}
      {heatView && (
        <figure className="card-sm p-4 sm:p-5">
          <figcaption>
            <span className="font-display text-sm font-semibold text-white">{t('d.heat.title')}</span>
            <span className="mt-1 block text-[11px] text-slate-400">
              {heatView.busiest
                ? t('d.heat.busiest', { d: WD[heatView.busiest.d], h: `${heatView.busiest.h}:00–${heatView.busiest.h + 1}:00` })
                : t('d.heat.none')}
              {heatView.quiet !== null && (
                <>
                  {' · '}
                  {t('d.heat.quiet', { h: `${heatView.quiet}:00–${heatView.quiet + 1}:00` })}
                </>
              )}
            </span>
          </figcaption>
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[320px]" onMouseLeave={() => setHeatHover(null)}>
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: `28px repeat(${heatView.hours.length}, minmax(0, 1fr))` }}>
                <span />
                {heatView.hours.map((h) => (
                  <span key={h} className="text-center text-[9px] tnum text-slate-500">
                    {h % 2 === 0 ? h : ''}
                  </span>
                ))}
                {WD.map((wd, d) => (
                  <div key={wd} className="contents">
                    <span className="self-center text-[10px] text-slate-400">{wd}</span>
                    {heatView.hours.map((h) => {
                      const v = heatView.heat[d]?.[h] ?? 0;
                      const on = heatHover?.d === d && heatHover?.h === h;
                      return (
                        <span
                          key={h}
                          role="img"
                          aria-label={`${wd} ${h}:00: ${v} ${t('d.tt.stamps')}`}
                          onMouseEnter={() => setHeatHover({ d, h })}
                          className={`aspect-square rounded-[3px] ${on ? 'outline outline-2 outline-white/80' : ''}`}
                          style={{ background: HEAT[level(v, heatView.max)] }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-slate-500">
                <span className="min-h-[14px] text-slate-300">
                  {heatHover
                    ? `${WD[heatHover.d]} ${heatHover.h}:00–${heatHover.h + 1}:00 · ${heatView.heat[heatHover.d]?.[heatHover.h] ?? 0} ${t('d.tt.stamps')}`
                    : ''}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {t('d.heat.less')}
                  {HEAT.map((c) => (
                    <i key={c} className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
                  ))}
                  {t('d.heat.more')}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">{t('d.heat.tz', { tz: a.timeZone ?? 'Europe/Bucharest' })}</p>
        </figure>
      )}

      {/* Distance to the reward: who is about to come back for it. */}
      <figure className="card-sm p-4 sm:p-5">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-sm font-semibold text-white">{t('d.prog.title', { n: required })}</span>
          {(a.nearReward ?? 0) > 0 && (
            <span className="chip chip-gold">{t('d.prog.near', { n: num(a.nearReward ?? 0) })}</span>
          )}
        </figcaption>
        <div className="mt-3 space-y-2">
          {buckets.map((b) => (
            <div key={b.k} className="grid grid-cols-[88px_minmax(0,1fr)_32px] items-center gap-2 text-[11px] sm:grid-cols-[110px_minmax(0,1fr)_40px]">
              <span className="truncate text-slate-400">{b.l}</span>
              <span className="h-3 rounded-r bg-white/[0.04]">
                <span
                  className="block h-full rounded-r-[4px]"
                  style={{ width: `${b.v === 0 ? 0 : Math.max(3, (b.v / bMax) * 100)}%`, background: b.k === 'full' ? '#F5C842' : C_RETURN }}
                />
              </span>
              <span className="tnum text-right font-semibold text-white">{num(b.v)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-slate-600">{t('b.stats.pii')}</p>
      </figure>
    </div>
  );
}
