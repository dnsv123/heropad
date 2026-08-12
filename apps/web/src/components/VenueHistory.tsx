import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';

import { getJson, type ApiClientError } from '../services/apiClient';
import { useT } from '../i18n';

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

  return (
    <div className={embedded ? '' : 'mt-4'}>
      {!embedded && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full rounded-full border border-hero-blue/30 px-4 py-2 text-sm text-slate-300 transition hover:border-hero-cyan hover:text-white"
        >
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
            <div className="mt-4 space-y-3">
              {/* Presets — the common questions, one tap each */}
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <button
                    key={p.k}
                    type="button"
                    onClick={() => applyPreset(p.k)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      preset === p.k
                        ? 'bg-hero-cyan font-semibold text-hero-deep'
                        : 'border border-hero-blue/25 text-slate-400 hover:border-hero-cyan hover:text-white'
                    }`}
                  >
                    {p.l}
                  </button>
                ))}
              </div>

              {/* Exact range + code search */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">
                  {t('b.hist.from')}
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setPreset('all');
                    }}
                    className="mt-1 w-full rounded-lg border border-hero-blue/25 bg-hero-deep/70 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] uppercase tracking-wider text-slate-500">
                  {t('b.hist.to')}
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setPreset('all');
                    }}
                    className="mt-1 w-full rounded-lg border border-hero-blue/25 bg-hero-deep/70 px-2 py-1.5 text-xs text-white"
                  />
                </label>
                <label className="col-span-2 text-[10px] uppercase tracking-wider text-slate-500 sm:col-span-1">
                  {t('b.hist.search')}
                  <input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') search();
                    }}
                    placeholder="K7M3PQ"
                    maxLength={6}
                    className="mt-1 w-full rounded-lg border border-hero-blue/25 bg-hero-deep/70 px-2 py-1.5 font-mono text-xs uppercase tracking-widest text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={search}
                  className="self-end rounded-lg bg-hero-blue/80 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-hero-cyan hover:text-hero-deep"
                >
                  {t('b.hist.apply')}
                </button>
              </div>

              {/* The applied customer filter, stated. Without this banner,
                  narrowing to one code looks like nothing happened. */}
              <AnimatePresence>
                {activeBy && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hero-cyan/40 bg-hero-cyan/10 px-3 py-2"
                  >
                    <p className="text-xs text-slate-300">
                      {t('b.hist.byfilter')}{' '}
                      <span className="font-semibold text-hero-cyan">{activeBy}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void load(from, to, activeCode, '')}
                      className="rounded-full border border-hero-cyan/40 px-3 py-0.5 text-[11px] text-hero-cyan transition hover:bg-hero-cyan hover:text-hero-deep"
                    >
                      ✕ {t('b.hist.clearcode')}
                    </button>
                  </motion.div>
                )}
                {activeCode && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hero-cyan/40 bg-hero-cyan/10 px-3 py-2"
                  >
                    <p className="text-xs text-slate-300">
                      {t('b.hist.filtered')}{' '}
                      <span className="font-mono tracking-widest text-hero-cyan">
                        {activeCode}
                      </span>
                      {events && events.length > 0 && (
                        <span className="ml-2 text-[10px] text-slate-500">
                          {t('b.hist.sum')
                            .replace('{s}', String(stampCount))
                            .replace('{r}', String(rewardCount))}
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={clearCustomer}
                      className="rounded-full border border-hero-cyan/40 px-3 py-0.5 text-[11px] text-hero-cyan transition hover:bg-hero-cyan hover:text-hero-deep"
                    >
                      ✕ {t('b.hist.clearcode')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                >
                  {t('b.hist.clear')}
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={!events || events.length === 0}
                  className="rounded-full border border-hero-blue/30 px-3 py-1 text-[11px] text-slate-300 transition hover:border-hero-cyan hover:text-white disabled:opacity-40"
                >
                  {t('b.hist.csv')}
                </button>
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </p>
              )}

              {loading && (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-11 animate-pulse rounded-xl border border-hero-blue/10 bg-hero-deep/60"
                    />
                  ))}
                </div>
              )}

              {!loading && events && events.length === 0 && (
                <p className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 px-3 py-6 text-center text-xs text-slate-500">
                  {t('b.hist.empty')}
                </p>
              )}

              {!loading && events && events.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      {t('b.hist.count').replace('{n}', String(events.length))}
                    </p>
                    <p className="text-[10px] text-slate-600">{t('b.hist.tapdetails')}</p>
                  </div>

                  <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-0.5">
                    {groups.map((g) => (
                      <div key={g.label}>
                        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-hero-gold/70">
                          {g.label}
                        </p>
                        <ul className="divide-y divide-hero-blue/10 overflow-hidden rounded-xl border border-hero-blue/15 bg-hero-deep/60">
                          {g.items.map(({ e, id }) => {
                            const isOpen = expanded === id;
                            return (
                              <li key={id}>
                                <button
                                  type="button"
                                  onClick={() => setExpanded(isOpen ? null : id)}
                                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                                    isOpen ? 'bg-hero-blue/10' : 'hover:bg-hero-blue/5'
                                  }`}
                                >
                                  {/* Type badge — reward vs stamp readable at a glance */}
                                  <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                                      e.kind === 'reward'
                                        ? 'bg-hero-gold/15 text-hero-gold'
                                        : e.kind === 'revoke'
                                          ? 'bg-red-500/10 text-red-300'
                                          : 'bg-hero-cyan/10 text-hero-cyan'
                                    }`}
                                  >
                                    {e.kind === 'reward' ? '🏆' : e.kind === 'revoke' ? '↩' : '☕'}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs text-slate-200">
                                      {e.kind === 'reward' ? (
                                        <span className="text-hero-gold">
                                          {t('b.hist.reward')}
                                        </span>
                                      ) : e.kind === 'revoke' ? (
                                        <span className="text-red-300">
                                          {t('b.hist.revoked')}
                                        </span>
                                      ) : (
                                        <span
                                          className={
                                            e.revoked
                                              ? 'text-slate-500 line-through'
                                              : 'text-hero-cyan'
                                          }
                                        >
                                          +1 {t('b.hist.stamp')}
                                        </span>
                                      )}
                                      {' · '}
                                      <span className="font-mono tracking-widest text-white">
                                        {e.code}
                                      </span>
                                    </span>
                                    <span className="mt-0.5 block text-[10px] text-slate-500">
                                      {time(e.at)}
                                      {e.grantedBy && (
                                        <>
                                          {' · '}
                                          {t('b.hist.by')}{' '}
                                          {e.grantedBy === 'owner'
                                            ? t('b.hist.owner')
                                            : e.grantedBy}
                                        </>
                                      )}
                                    </span>
                                  </span>
                                  <span
                                    className={`shrink-0 text-slate-600 transition-transform ${
                                      isOpen ? 'rotate-180' : ''
                                    }`}
                                  >
                                    ⌄
                                  </span>
                                </button>

                                <AnimatePresence initial={false}>
                                  {isOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="overflow-hidden bg-hero-deep/80"
                                    >
                                      <dl className="space-y-1.5 px-3 pb-3 pt-1 text-[11px]">
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
                                            ? `${t('b.hist.reward')} (−${
                                                e.stampsConsumed ?? 0
                                              } ${t('b.hist.stamps')})`
                                              : `+1 ${t('b.hist.stamp')}`}
                                        </Row>
                                        <Row label={t('b.hist.d.who')}>
                                          <button
                                            type="button"
                                            onClick={() => copyCode(e.code)}
                                            className="font-mono tracking-widest text-white underline-offset-2 hover:underline"
                                          >
                                            {e.code} ⧉
                                          </button>
                                        </Row>
                                        {e.grantedBy && (
                                          <Row label={t('b.hist.d.by')}>
                                            {e.grantedBy === 'owner'
                                              ? t('b.hist.owner')
                                              : e.grantedBy}
                                          </Row>
                                        )}
                                        {e.kind === 'stamp' && e.source && (
                                          <Row label={t('b.hist.d.source')}>
                                            {e.source.toUpperCase()}
                                          </Row>
                                        )}
                                        {e.kind === 'reward' && (
                                          <Row label={t('b.hist.d.trophy')}>
                                            {e.trophyAssetId ? (
                                              <span className="text-hero-gold">
                                                {t('b.hist.d.minted')}
                                              </span>
                                            ) : (
                                              <span className="text-slate-500">
                                                {t('b.hist.d.notminted')}
                                              </span>
                                            )}
                                          </Row>
                                        )}
                                        <div className="pt-1">
                                          <button
                                            type="button"
                                            onClick={() => focusCustomer(e.code)}
                                            className="rounded-full border border-hero-cyan/40 px-3 py-1 text-[11px] text-hero-cyan transition hover:bg-hero-cyan hover:text-hero-deep"
                                          >
                                            {t('b.hist.seeall')} →
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
                    <p className="text-[10px] text-hero-gold/80">
                      {t('b.hist.truncated').replace('{n}', String(events.length))}
                    </p>
                  )}
                </>
              )}

              <p className="text-center text-[10px] leading-relaxed text-slate-600">
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
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-hero-cyan px-4 py-2 text-xs font-semibold text-hero-deep shadow-lg"
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
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-300">{children}</dd>
    </div>
  );
}
