import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import { getJson, type ApiClientError } from '../services/apiClient';
import { useT } from '../i18n';
import Glyph from './Glyph';

// The venue's own transaction log — every stamp and reward IT handed out.
//
// This is the merchant's till, not a customer profile: people appear only as
// the anonymous 6-character code the staff already reads at the counter, and
// nothing from other venues is ever included. The value for the owner is the
// "by" line — seeing WHICH account granted each stamp is what makes staff
// handing free coffees to friends visible, which no automatic ceiling can do.
//
// Two interaction rules earn their weight here: a row opens its own details
// (the obvious meaning of tapping a line), and narrowing to one customer is a
// separate, announced action. Filtering silently in place reads as a dead
// button when the list before and after look alike.

interface HistoryEvent {
  kind: 'stamp' | 'reward' | 'revoke';
  revoked?: boolean;
  at: string;
  code: string;
  source?: string;
  stampsConsumed?: number;
  trophyAssetId?: string | null;
  grantedBy: string | null;
}

interface HistoryResponse {
  ok: true;
  events: HistoryEvent[];
  limit: number;
  truncated: boolean;
}

type Preset = 'today' | '7d' | '30d' | 'all';

const CODE_RE = /^[A-Z0-9]{6}$/;

/** Local YYYY-MM-DD, n days back. Local, not UTC: the merchant means their day. */
function dayString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rangeForPreset(p: Preset): { from: string; to: string } {
  switch (p) {
    case 'today':
      return { from: dayString(0), to: dayString(0) };
    case '7d':
      return { from: dayString(6), to: dayString(0) };
    case '30d':
      return { from: dayString(29), to: dayString(0) };
    case 'all':
      return { from: '', to: '' };
  }
}

export default function VenueHistory({
  slug,
  embedded = false,
  byStaff = '',
}: {
  slug: string;
  /** Inside a folder tab the panel is already visible; drop its own toggle. */
  embedded?: boolean;
  /** Set from the Team panel: show only what this person did. */
  byStaff?: string;
}) {
  const { getAccessToken } = usePrivy();
  const { t, lang } = useT();
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB';

  const [open, setOpen] = useState(embedded);
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [preset, setPreset] = useState<Preset>('7d');
  const [from, setFrom] = useState(() => rangeForPreset('7d').from);
  const [to, setTo] = useState(() => rangeForPreset('7d').to);
  const [codeInput, setCodeInput] = useState('');
  /** The code actually applied to the current result set (not what is typed). */
  const [activeCode, setActiveCode] = useState('');
  const [activeBy, setActiveBy] = useState('');

  const load = useCallback(
    async (f: string, tt: string, c: string, by = '') => {
      setLoading(true);
      setError(null);
      setExpanded(null);
      try {
        const qs = new URLSearchParams();
        if (f) qs.set('from', f);
        if (tt) qs.set('to', tt);
        if (c) qs.set('code', c);
        if (by) qs.set('by', by);
        const token = await getAccessToken();
        const r = await getJson<HistoryResponse>(
          `/api/loyalty/merchant/${slug}/history?${qs.toString()}`,
          token ?? undefined
        );
        setEvents(r.events);
        setTruncated(r.truncated);
        setActiveCode(c);
        setActiveBy(by);
      } catch (err) {
        setError((err as ApiClientError).message);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [slug, getAccessToken]
  );

  useEffect(() => {
    if (open && events === null) void load(from, to, '', byStaff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The Team panel picked someone: widen the range and show only their work.
  useEffect(() => {
    if (!byStaff) return;
    setPreset('30d');
    const r = rangeForPreset('30d');
    setFrom(r.from);
    setTo(r.to);
    void load(r.from, r.to, '', byStaff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byStaff]);

  function applyPreset(p: Preset) {
    const r = rangeForPreset(p);
    setPreset(p);
    setFrom(r.from);
    setTo(r.to);
    void load(r.from, r.to, activeCode);
  }

  function search() {
    const c = codeInput.trim().toUpperCase();
    if (c && !CODE_RE.test(c)) {
      setError(`${t('b.hist.search')}: 6 ${lang === 'ro' ? 'caractere' : 'characters'}`);
      return;
    }
    void load(from, to, c);
  }

  /** Narrow to one customer. Widens the range too: their history is the point. */
  function focusCustomer(code: string) {
    setCodeInput(code);
    setPreset('all');
    setFrom('');
    setTo('');
    void load('', '', code);
  }

  function clearCustomer() {
    setCodeInput('');
    void load(from, to, '');
  }

  function clearAll() {
    const r = rangeForPreset('7d');
    setPreset('7d');
    setFrom(r.from);
    setTo(r.to);
    setCodeInput('');
    void load(r.from, r.to, '');
  }

  function copyCode(code: string) {
    void navigator.clipboard?.writeText(code);
    setToast(t('b.hist.copied'));
    window.setTimeout(() => setToast(null), 1600);
  }

  /** CSV of exactly what is on screen — the filters are the export scope. */
  function exportCsv() {
    if (!events || events.length === 0) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ['timestamp', 'type', 'customer_code', 'quantity', 'granted_by', 'trophy_asset_id'],
      ...events.map((e) => [
        e.at,
        e.kind,
        e.code,
        e.kind === 'stamp' ? '1' : e.kind === 'revoke' ? '-1' : String(e.stampsConsumed ?? ''),
        e.grantedBy ?? '',
        e.trophyAssetId ?? '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => esc(String(c))).join(',')).join('\r\n');
    // BOM so Excel opens UTF-8 correctly instead of mangling diacritics.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heropad-${slug}-${activeCode || from || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  /** "Today" / "Yesterday" / "Tue, 12 Aug" — a date the eye can skip past. */
  function dayLabel(iso: string): string {
    const d = new Date(iso);
    const key = (x: Date) => x.toDateString();
    const now = new Date();
    const yest = new Date();
    yest.setDate(now.getDate() - 1);
    if (key(d) === key(now)) return t('b.hist.today');
    if (key(d) === key(yest)) return t('b.hist.yesterday');
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // Group into day sections so a long list reads as days, not as 200 rows.
  const groups: Array<{ label: string; items: Array<{ e: HistoryEvent; id: string }> }> = [];
  (events ?? []).forEach((e, i) => {
    const label = dayLabel(e.at);
    const id = `${e.at}-${e.code}-${i}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push({ e, id });
    else groups.push({ label, items: [{ e, id }] });
  });

  const stampCount = (events ?? []).filter((e) => e.kind === 'stamp').length;
  const rewardCount = (events ?? []).filter((e) => e.kind === 'reward').length;

  const presets: Array<{ k: Preset; l: string }> = [
    { k: 'today', l: t('b.hist.today') },
    { k: '7d', l: t('b.hist.7d') },
    { k: '30d', l: t('b.hist.30d') },
    { k: 'all', l: t('b.hist.all') },
  ];

  const revokeCount = (events ?? []).filter((e) => e.kind === 'revoke').length;
  const inputCls =
    'mt-1.5 w-full rounded-xl border border-white/10 bg-hero-deep px-3 py-2 text-xs text-white focus:border-[#F7A30C]/60 focus:outline-none';

  return (
    <div className={embedded ? '' : 'mt-4'}>
      {!embedded && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300 transition hover:border-white/30 hover:text-white"
        >
          <Glyph name="history" />
          {open ? t('b.hist.hide') : t('b.hist')}
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className={`${embedded ? '' : 'mt-4'} space-y-4`}>
              {embedded && (
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F7A30C]">{t('b.tab.hist')}</p>
                    <h3 className="mt-1 font-display text-xl font-bold text-white">{t('b.hist.title')}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={exportCsv}
                    disabled={!events || events.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/[0.12] disabled:opacity-40"
                  >
                    <Glyph name="download" className="h-3.5 w-3.5" />
                    {t('b.hist.csv')}
                  </button>
                </div>
              )}

              {/* Presets: the common questions, one tap each. */}
              <div role="group" className="flex gap-1 rounded-2xl border border-white/[0.08] bg-hero-deep/70 p-1">
                {presets.map((p) => (
                  <button
                    key={p.k}
                    type="button"
                    onClick={() => applyPreset(p.k)}
                    aria-pressed={preset === p.k}
                    className={`flex-1 rounded-xl px-2 py-2 text-xs font-medium transition ${
                      preset === p.k ? 'bg-[#F7A30C] text-hero-deep' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {p.l}
                  </button>
                ))}
              </div>

              {/* Exact range + code search */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
                <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  {t('b.hist.from')}
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setPreset('all');
                    }}
                    className={inputCls}
                  />
                </label>
                <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  {t('b.hist.to')}
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setPreset('all');
                    }}
                    className={inputCls}
                  />
                </label>
                <label className="col-span-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:col-span-1">
                  {t('b.hist.search')}
                  <input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') search();
                    }}
                    placeholder="K7M3PQ"
                    maxLength={6}
                    className={`${inputCls} font-mono uppercase tracking-widest placeholder:text-slate-700`}
                  />
                </label>
                <button
                  type="button"
                  onClick={search}
                  className="col-span-2 inline-flex items-center justify-center gap-1.5 self-end rounded-xl bg-white px-4 py-2 text-xs font-semibold text-hero-deep transition hover:bg-slate-200 sm:col-span-1"
                >
                  <Glyph name="search" className="h-3.5 w-3.5" strokeWidth={2.2} />
                  {t('b.hist.apply')}
                </button>
              </div>

              {/* The applied filters, stated. Without this, narrowing to one
                  code looks like nothing happened. */}
              <AnimatePresence>
                {activeBy && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F7A30C]/35 bg-[#F7A30C]/10 px-3 py-2.5"
                  >
                    <p className="flex items-center gap-2 text-xs text-slate-300">
                      <Glyph name="user" className="h-3.5 w-3.5 text-[#FFC45A]" />
                      {t('b.hist.byfilter')} <span className="font-semibold text-white">{activeBy}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void load(from, to, activeCode, '')}
                      className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1 text-[11px] text-white transition hover:bg-white/[0.15]"
                    >
                      <Glyph name="x" className="h-3 w-3" /> {t('b.hist.clearcode')}
                    </button>
                  </motion.div>
                )}
                {activeCode && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F7A30C]/35 bg-[#F7A30C]/10 px-3 py-2.5"
                  >
                    <p className="text-xs text-slate-300">
                      {t('b.hist.filtered')}{' '}
                      <span className="font-mono font-semibold tracking-widest text-white">{activeCode}</span>
                    </p>
                    <button
                      type="button"
                      onClick={clearCustomer}
                      className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1 text-[11px] text-white transition hover:bg-white/[0.15]"
                    >
                      <Glyph name="x" className="h-3 w-3" /> {t('b.hist.clearcode')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
              )}

              {loading && (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 animate-pulse rounded-2xl border border-white/[0.06] bg-hero-deep/60" />
                  ))}
                </div>
              )}

              {!loading && events && events.length === 0 && (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.06] text-slate-400">
                    <Glyph name="history" className="h-5 w-5" />
                  </span>
                  <p className="text-xs text-slate-400">{t('b.hist.empty')}</p>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="mt-1 text-[11px] text-slate-400 underline underline-offset-2 hover:text-white"
                  >
                    {t('b.hist.clear')}
                  </button>
                </div>
              )}

              {!loading && events && events.length > 0 && (
                <>
                  {/* What this range adds up to, before the lines. */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: stampCount, l: t('b.today.stamps'), c: 'text-white' },
                      { v: rewardCount, l: t('b.today.rewards'), c: 'text-[#FFC45A]' },
                      { v: revokeCount, l: t('b.hist.k.revokes'), c: revokeCount > 0 ? 'text-red-300' : 'text-slate-500' },
                    ].map((k) => (
                      <div key={k.l} className="rounded-2xl border border-white/[0.07] bg-hero-deep/50 px-2 py-3 text-center">
                        <p className={`tnum font-display text-2xl font-bold leading-none ${k.c}`}>{k.v}</p>
                        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">{k.l}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="tnum text-[11px] text-slate-500">
                      {t('b.hist.count').replace('{n}', String(events.length))}
                    </p>
                    <p className="text-[11px] text-slate-600">{t('b.hist.tapdetails')}</p>
                  </div>

                  <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-0.5">
                    {groups.map((g) => (
                      <div key={g.label}>
                        <p className="sticky top-0 z-10 mb-1.5 bg-hero-navy/95 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 backdrop-blur">
                          {g.label}
                        </p>
                        <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.07] bg-hero-deep/50">
                          {g.items.map(({ e, id }) => {
                            const isOpen = expanded === id;
                            return (
                              <li key={id}>
                                <button
                                  type="button"
                                  onClick={() => setExpanded(isOpen ? null : id)}
                                  aria-expanded={isOpen}
                                  className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                                    isOpen ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
                                  }`}
                                >
                                  <span
                                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                                      e.kind === 'reward'
                                        ? 'bg-[#F7A30C]/15 text-[#FFC45A]'
                                        : e.kind === 'revoke'
                                          ? 'bg-red-500/10 text-red-300'
                                          : 'bg-white/[0.06] text-white'
                                    }`}
                                  >
                                    <Glyph
                                      name={e.kind === 'reward' ? 'trophy' : e.kind === 'revoke' ? 'back' : 'stamp'}
                                      className="h-4 w-4"
                                    />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px]">
                                      {e.kind === 'reward' ? (
                                        <span className="font-semibold text-[#FFC45A]">{t('b.hist.reward')}</span>
                                      ) : e.kind === 'revoke' ? (
                                        <span className="font-semibold text-red-300">{t('b.hist.revoked')}</span>
                                      ) : (
                                        <span className={e.revoked ? 'text-slate-500 line-through' : 'font-semibold text-white'}>
                                          +1 {t('b.hist.stamp')}
                                        </span>
                                      )}
                                      <span className="ml-2 font-mono text-xs tracking-widest text-slate-300">{e.code}</span>
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                                      <span className="tnum">{time(e.at)}</span>
                                      {e.grantedBy && (
                                        <>
                                          {' · '}
                                          {t('b.hist.by')} {e.grantedBy === 'owner' ? t('b.hist.owner') : e.grantedBy}
                                        </>
                                      )}
                                    </span>
                                  </span>
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                    aria-hidden
                                  >
                                    <path d="m6 9 6 6 6-6" />
                                  </svg>
                                </button>

                                <AnimatePresence initial={false}>
                                  {isOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="overflow-hidden bg-hero-deep/80"
                                    >
                                      <dl className="space-y-2 px-4 pb-4 pt-2 text-[11px]">
                                        <Row label={t('b.hist.d.when')}>
                                          {new Date(e.at).toLocaleString(locale, {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                          })}
                                        </Row>
                                        <Row label={t('b.hist.d.what')}>
                                          {e.kind === 'revoke'
                                            ? t('b.hist.revoked')
                                            : e.kind === 'reward'
                                              ? `${t('b.hist.reward')} (−${e.stampsConsumed ?? 0} ${t('b.hist.stamps')})`
                                              : `+1 ${t('b.hist.stamp')}`}
                                        </Row>
                                        <Row label={t('b.hist.d.who')}>
                                          <button
                                            type="button"
                                            onClick={() => copyCode(e.code)}
                                            className="inline-flex items-center gap-1.5 font-mono tracking-widest text-white underline-offset-2 hover:underline"
                                          >
                                            {e.code}
                                            <Glyph name="copy" className="h-3 w-3 text-slate-500" />
                                          </button>
                                        </Row>
                                        {e.grantedBy && (
                                          <Row label={t('b.hist.d.by')}>
                                            {e.grantedBy === 'owner' ? t('b.hist.owner') : e.grantedBy}
                                          </Row>
                                        )}
                                        {e.kind === 'stamp' && e.source && (
                                          <Row label={t('b.hist.d.source')}>{e.source.toUpperCase()}</Row>
                                        )}
                                        {e.kind === 'reward' && (
                                          <Row label={t('b.hist.d.trophy')}>
                                            {e.trophyAssetId ? (
                                              <span className="text-[#FFC45A]">{t('b.hist.d.minted')}</span>
                                            ) : (
                                              <span className="text-slate-500">{t('b.hist.d.notminted')}</span>
                                            )}
                                          </Row>
                                        )}
                                        <div className="pt-1.5">
                                          <button
                                            type="button"
                                            onClick={() => focusCustomer(e.code)}
                                            className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-white/[0.14]"
                                          >
                                            {t('b.hist.seeall')}
                                            <Glyph name="arrow" className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </dl>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {truncated && (
                    <p className="text-[11px] text-[#FFC45A]/90">
                      {t('b.hist.truncated').replace('{n}', String(events.length))}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                    >
                      {t('b.hist.clear')}
                    </button>
                    {!embedded && (
                      <button
                        type="button"
                        onClick={exportCsv}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] text-slate-200 transition hover:bg-white/[0.12]"
                      >
                        <Glyph name="download" className="h-3.5 w-3.5" />
                        {t('b.hist.csv')}
                      </button>
                    )}
                  </div>
                </>
              )}

              <p className="flex items-start gap-2 rounded-2xl bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
                <Glyph name="shield" className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                {t('b.hist.pii')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-hero-deep shadow-lg"
          >
            {toast}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-200">{children}</dd>
    </div>
  );
}
