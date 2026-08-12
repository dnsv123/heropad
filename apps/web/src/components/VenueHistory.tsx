import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

import { getJson, type ApiClientError } from '../services/apiClient';
import { useT } from '../i18n';

// The venue's own transaction log — every stamp and reward IT handed out.
//
// This is the merchant's till, not a customer profile: people appear only as
// the anonymous 6-character code the staff already reads at the counter, and
// nothing from other venues is ever included. The value for the owner is the
// "by" column — seeing WHICH account granted each stamp is what makes staff
// giving free coffees to friends visible without policing anyone.

interface HistoryEvent {
  kind: 'stamp' | 'reward';
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

export default function VenueHistory({ slug }: { slug: string }) {
  const { getAccessToken } = usePrivy();
  const { t, lang } = useT();

  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preset, setPreset] = useState<Preset>('7d');
  const [from, setFrom] = useState(() => rangeForPreset('7d').from);
  const [to, setTo] = useState(() => rangeForPreset('7d').to);
  const [code, setCode] = useState('');

  const load = useCallback(
    async (f: string, tt: string, c: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (f) qs.set('from', f);
        if (tt) qs.set('to', tt);
        if (c) qs.set('code', c);
        const token = await getAccessToken();
        const r = await getJson<HistoryResponse>(
          `/api/loyalty/merchant/${slug}/history?${qs.toString()}`,
          token ?? undefined
        );
        setEvents(r.events);
        setTruncated(r.truncated);
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
    if (open && events === null) void load(from, to, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function applyPreset(p: Preset) {
    const r = rangeForPreset(p);
    setPreset(p);
    setFrom(r.from);
    setTo(r.to);
    void load(r.from, r.to, code);
  }

  function search() {
    const c = code.trim().toUpperCase();
    // A partial code would silently return nothing; say so instead.
    if (c && !CODE_RE.test(c)) {
      setError(t('b.hist.search') + ': 6 ' + (lang === 'ro' ? 'caractere' : 'characters'));
      return;
    }
    setCode(c);
    void load(from, to, c);
  }

  function clear() {
    const r = rangeForPreset('7d');
    setPreset('7d');
    setFrom(r.from);
    setTo(r.to);
    setCode('');
    void load(r.from, r.to, '');
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
        e.kind === 'stamp' ? '1' : String(e.stampsConsumed ?? ''),
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
    a.download = `heropad-${slug}-${from || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'ro' ? 'ro-RO' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const presets: Array<{ k: Preset; l: string }> = [
    { k: 'today', l: t('b.hist.today') },
    { k: '7d', l: t('b.hist.7d') },
    { k: '30d', l: t('b.hist.30d') },
    { k: 'all', l: t('b.hist.all') },
  ];

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-full border border-hero-blue/30 px-4 py-2 text-sm text-slate-300 transition hover:border-hero-cyan hover:text-white"
      >
        {open ? t('b.hist.hide') : t('b.hist')}
      </button>

      {open && (
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
                    ? 'bg-hero-cyan text-hero-deep'
                    : 'border border-hero-blue/25 text-slate-400 hover:text-white'
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
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
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

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={clear}
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

          {loading && <p className="text-xs text-slate-500">{t('b.hist.loading')}</p>}

          {!loading && events && events.length === 0 && (
            <p className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 px-3 py-6 text-center text-xs text-slate-500">
              {t('b.hist.empty')}
            </p>
          )}

          {!loading && events && events.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                {t('b.hist.count').replace('{n}', String(events.length))}
              </p>
              <ul className="max-h-96 divide-y divide-hero-blue/10 overflow-y-auto rounded-xl border border-hero-blue/15 bg-hero-deep/60">
                {events.map((e, i) => (
                  <li
                    key={`${e.at}-${e.code}-${i}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-slate-300">
                        {e.kind === 'reward' ? (
                          <span className="text-hero-gold">🏆 {t('b.hist.reward')}</span>
                        ) : (
                          <span className="text-hero-cyan">+1 {t('b.hist.stamp')}</span>
                        )}
                        {' · '}
                        <span className="font-mono tracking-widest text-white">{e.code}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {fmt(e.at)}
                        {e.grantedBy && (
                          <>
                            {' · '}
                            {t('b.hist.by')}{' '}
                            <span className="text-slate-400">
                              {e.grantedBy === 'owner' ? t('b.hist.owner') : e.grantedBy}
                            </span>
                          </>
                        )}
                        {e.kind === 'reward' && e.trophyAssetId && ` · ${t('b.hist.trophy')} ✓`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCode(e.code);
                        void load(from, to, e.code);
                      }}
                      className="shrink-0 rounded-full border border-hero-blue/25 px-2 py-0.5 text-[10px] text-slate-500 transition hover:border-hero-cyan hover:text-white"
                    >
                      🔍
                    </button>
                  </li>
                ))}
              </ul>
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
      )}
    </div>
  );
}
