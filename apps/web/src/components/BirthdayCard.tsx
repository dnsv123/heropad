import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '../lib/auth';

import { getJson, postJson } from '../services/apiClient';
import { useT } from '../i18n';

// Profile → Birthday card. Day + month ONLY — the year is never asked for.
// Voluntary by design: the explanation sits next to the field, and "Remove"
// deletes the data. What the café sees is a computed "today is their day"
// flag at the counter, never the date itself.

interface BirthdayResponse {
  ok: true;
  day: number | null;
  month: number | null;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export default function BirthdayCard() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { lang, t } = useT();
  const [saved, setSaved] = useState<{ day: number | null; month: number | null } | null>(null);
  const [day, setDay] = useState(0);
  const [month, setMonth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Month names in the visitor's own language, from the platform — no
  // dictionary of twelve keys per language to keep in sync.
  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2024, i, 1)));
  }, [lang]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await getJson<BirthdayResponse>('/api/loyalty/me/birthday', token);
        if (!active) return;
        setSaved({ day: r.day, month: r.month });
        setDay(r.day ?? 0);
        setMonth(r.month ?? 0);
      } catch {
        /* the card simply stays in its empty state */
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authenticated, getAccessToken]);

  if (!ready || !authenticated) return null;

  const maxDay = month >= 1 ? DAYS_IN_MONTH[month - 1] : 31;
  const validPick = day >= 1 && month >= 1 && day <= maxDay;
  const unchanged = saved !== null && saved.day === day && saved.month === month;

  async function submit(body: { day: number; month: number } | { clear: true }) {
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<typeof body, BirthdayResponse>(
        '/api/loyalty/me/birthday',
        body,
        token ?? undefined
      );
      setSaved({ day: r.day, month: r.month });
      setDay(r.day ?? 0);
      setMonth(r.month ?? 0);
      setNotice(t('clear' in body ? 'bday.removed' : 'bday.saved'));
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-hero-navy p-6">
      <h2 className="font-display text-lg font-semibold text-white">🎂 {t('bday.title')}</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{t('bday.explainer')}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="rounded-xl border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-200"
        >
          <option value={0}>{t('bday.day')}</option>
          {Array.from({ length: maxDay }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => {
            const m = Number(e.target.value);
            setMonth(m);
            // Switching to a shorter month must not leave "31 February" armed.
            if (m >= 1 && day > DAYS_IN_MONTH[m - 1]) setDay(0);
          }}
          className="rounded-xl border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-200"
        >
          <option value={0}>{t('bday.month')}</option>
          {monthNames.map((name, i) => (
            <option key={i + 1} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !validPick || unchanged}
          onClick={() => void submit({ day, month })}
          className="rounded-full bg-hero-gold px-5 py-2 text-sm font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-40"
        >
          {t('bday.save')}
        </button>
        {saved?.day !== null && saved !== null && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit({ clear: true })}
            className="rounded-full border border-slate-600/50 px-4 py-2 text-xs text-slate-400 transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
          >
            {t('bday.remove')}
          </button>
        )}
      </div>

      {notice && <p className="mt-3 text-xs text-hero-cyan">{notice}</p>}
      <p className="mt-3 text-[11px] text-slate-600">{t('bday.privacy')}</p>
    </div>
  );
}
