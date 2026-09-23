import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import { getJson, postJson, type ApiClientError } from '../services/apiClient';
import { useT } from '../i18n';
import Glyph from './Glyph';

// Team accounts for a venue.
// ---------------------------------------------------------------------------
// Every stamp already records which account granted it. Until each barista had
// their own account, that column said "the owner" for everything and the owner
// could not see what they most want to see: which of their people gave a card
// away. This panel is what turns that column into an answer.
//
// The activation code is the centrepiece of the UI, not a detail: handing it
// over is the only step the owner performs, and a code they cannot find is a
// team member who never gets set up.

interface StaffMember {
  id: string;
  displayName: string;
  role: 'staff' | 'manager';
  active: boolean;
  linked: boolean;
  activationCode: string | null;
  createdAt: string;
  /** Null until they activate their seat. Counts only, never customers. */
  activity: { granted30d: number; revoked30d: number; grantedToday: number } | null;
}

interface StaffResponse {
  ok: true;
  seats: number;
  used: number;
  staff: StaffMember[];
}

const PUBLIC_BASE =
  typeof window !== 'undefined' ? window.location.origin : 'https://heropad.supervictoruniverse.com';

export default function VenueStaff({
  slug,
  onInspect,
}: {
  slug: string;
  /** Jump to the history filtered to this person. The numbers below say how
      much someone did; the history says exactly what. */
  onInspect?: (displayName: string) => void;
}) {
  const { getAccessToken } = usePrivy();
  const { t } = useT();

  const [data, setData] = useState<StaffResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [justAdded, setJustAdded] = useState<{ name: string; code: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const at = await getAccessToken();
      const r = await getJson<StaffResponse>(
        `/api/loyalty/merchant/${slug}/staff`,
        at ?? undefined
      );
      setData(r);
    } catch (err) {
      setError((err as ApiClientError).message);
    }
  }, [slug, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const at = await getAccessToken();
      const r = await postJson<
        { displayName: string },
        { ok: true; displayName: string; activationCode: string }
      >(`/api/loyalty/merchant/${slug}/staff`, { displayName: name.trim() }, at ?? undefined);
      setJustAdded({ name: r.displayName, code: r.activationCode });
      setName('');
      await load();
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: string) {
    setBusy(true);
    setError(null);
    try {
      const at = await getAccessToken();
      const r = await postJson<{ action: string }, { ok: true; activationCode?: string }>(
        `/api/loyalty/merchant/${slug}/staff/${id}`,
        { action },
        at ?? undefined
      );
      if (r.activationCode) {
        const who = data?.staff.find((s) => s.id === id)?.displayName ?? '';
        setJustAdded({ name: who, code: r.activationCode });
      }
      await load();
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  function copy(code: string) {
    void navigator.clipboard?.writeText(code);
    setCopied(code);
    window.setTimeout(() => setCopied(null), 1600);
  }

  /**
   * The whole message, not just the code. An owner should not have to know the
   * link, and a barista handed a bare code has nowhere to type it.
   */
  /** The link carries the code: the barista opens it and the field is already
   *  filled — one tap, nothing to type on a phone behind a counter. */
  const inviteLink = (code: string) => `${PUBLIC_BASE}/business?venue=${slug}&code=${code}`;

  function copyInvite(who: string, code: string) {
    void navigator.clipboard?.writeText(
      t('b.staff.invite')
        .replace('{name}', who)
        .replace('{link}', inviteLink(code))
        .replace('{code}', code)
    );
    setCopied(`invite:${code}`);
    window.setTimeout(() => setCopied(null), 1800);
  }

  function copyLink(code: string) {
    void navigator.clipboard?.writeText(inviteLink(code));
    setCopied(`link:${code}`);
    window.setTimeout(() => setCopied(null), 1800);
  }

  const seatsLeft = data ? data.seats - data.used : 0;
  const full = data ? seatsLeft <= 0 : false;

  const initials = (n: string) =>
    n
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');

  return (
    <div>
      {/* Head: who is on the team, and how many seats are left, as seats. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F7A30C]">{t('b.tab.team')}</p>
          <h3 className="mt-1 font-display text-xl font-bold text-white">{t('b.staff.title')}</h3>
        </div>
        {data && (
          <div className="text-right">
            <div className="flex justify-end gap-1" aria-hidden>
              {Array.from({ length: data.seats }, (_, i) => (
                <span
                  key={i}
                  className={`h-2 w-5 rounded-full ${i < data.used ? 'bg-[#F7A30C]' : 'bg-white/[0.12]'}`}
                />
              ))}
            </div>
            <p className={`tnum mt-1.5 text-[11px] ${full ? 'text-[#FFC45A]' : 'text-slate-400'}`}>
              {t('b.staff.seats').replace('{u}', String(data.used)).replace('{s}', String(data.seats))}
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 max-w-prose text-xs leading-relaxed text-slate-400">{t('b.staff.why')}</p>

      {/* The code, front and centre, right after it is issued: a ticket. */}
      <AnimatePresence>
        {justAdded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative mt-4 overflow-hidden rounded-3xl border border-[#F7A30C]/40 p-5 text-center"
            style={{
              background:
                'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 7px), linear-gradient(145deg, #14357F 0%, #0A2766 45%, #061A47 100%)',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#FFC45A]">
              {t('b.staff.codefor').replace('{name}', justAdded.name)}
            </p>
            <button
              type="button"
              onClick={() => copy(justAdded.code)}
              className="tnum mt-3 font-mono text-4xl font-bold tracking-[0.3em] text-white"
            >
              {justAdded.code}
            </button>
            <p className="mx-auto mt-2 max-w-xs text-[11px] leading-relaxed text-slate-300">{t('b.staff.codehint')}</p>
            {/* The link itself, visible: an owner should never have to know
                it or ask for it. Tapping it copies it. */}
            <button
              type="button"
              onClick={() => copyLink(justAdded.code)}
              className="mt-4 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-hero-deep/70 px-3 py-2 text-left font-mono text-[11px] text-slate-300"
              title={inviteLink(justAdded.code)}
            >
              <Glyph name="copy" className="h-3.5 w-3.5 text-slate-500" />
              <span className="min-w-0 flex-1 truncate">
                {copied === `link:${justAdded.code}` ? t('b.staff.copied') : inviteLink(justAdded.code)}
              </span>
            </button>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => copyInvite(justAdded.name, justAdded.code)}
                className="btn btn-primary btn-sm justify-center gap-2 sm:col-span-2"
              >
                <Glyph name="copy" className="h-3.5 w-3.5" />
                {copied === `invite:${justAdded.code}` ? t('b.staff.copied') : t('b.staff.copyinvite')}
              </button>
              <button type="button" onClick={() => copy(justAdded.code)} className="btn btn-ghost btn-sm justify-center">
                {copied === justAdded.code ? t('b.staff.copied') : t('b.staff.copy')}
              </button>
              <button type="button" onClick={() => setJustAdded(null)} className="btn btn-ghost btn-sm justify-center">
                {t('b.staff.done')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add */}
      <div className="mt-5 flex gap-2">
        <label htmlFor="staff-name" className="sr-only">
          {t('b.staff.placeholder')}
        </label>
        <input
          id="staff-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          disabled={full}
          placeholder={t('b.staff.placeholder')}
          maxLength={40}
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-hero-deep px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-[#F7A30C]/60 focus:outline-none disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || full || name.trim().length < 2}
          className="flex shrink-0 items-center gap-2 rounded-2xl bg-[#F7A30C] px-4 py-3 text-sm font-semibold text-hero-deep transition hover:bg-[#FFB42A] disabled:opacity-40"
        >
          <Glyph name="userPlus" />
          {t('b.staff.add')}
        </button>
      </div>
      {full && <p className="mt-2 text-[11px] text-[#FFC45A]">{t('b.staff.full')}</p>}

      {error && (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
      )}

      {/* The people */}
      <ul className="mt-4 space-y-2">
        {(data?.staff ?? []).map((s) => (
          <li
            key={s.id}
            className={`rounded-2xl border px-3 py-3 sm:px-4 ${
              s.active ? 'border-white/[0.08] bg-hero-deep/50' : 'border-white/[0.05] bg-hero-deep/30 opacity-70'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold ${
                  s.linked ? 'bg-[#F7A30C]/15 text-[#FFC45A] ring-1 ring-[#F7A30C]/30' : 'bg-white/[0.06] text-slate-400 ring-1 ring-white/10'
                }`}
              >
                {initials(s.displayName) || '?'}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${s.active ? 'text-white' : 'text-slate-500'}`}>
                  {s.displayName}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                  {s.linked ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <Glyph name="check" className="h-3 w-3" strokeWidth={2.4} />
                      {t('b.staff.linked')}
                    </span>
                  ) : s.activationCode ? (
                    <button
                      type="button"
                      onClick={() => copy(s.activationCode as string)}
                      className="inline-flex items-center gap-1 font-mono tracking-widest text-[#FFC45A] underline-offset-2 hover:underline"
                    >
                      {copied === s.activationCode ? t('b.staff.copied') : s.activationCode}
                      <Glyph name="copy" className="h-3 w-3" />
                    </button>
                  ) : (
                    <span className="text-slate-500">{t('b.staff.nocode')}</span>
                  )}
                  {!s.active && <span className="text-slate-500">{t('b.staff.off')}</span>}
                  {s.linked && s.activity && (
                    <>
                      <span className="tnum text-slate-400">
                        {t('b.staff.act').replace('{n}', String(s.activity.granted30d))}
                      </span>
                      {s.activity.grantedToday > 0 && (
                        <span className="tnum text-slate-500">
                          {t('b.staff.acttoday').replace('{n}', String(s.activity.grantedToday))}
                        </span>
                      )}
                      {s.activity.revoked30d > 0 && (
                        <span className="tnum text-red-300/90">
                          {t('b.staff.revokes').replace('{n}', String(s.activity.revoked30d))}
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] sm:pl-[52px]">
              {s.linked && onInspect && (
                <button
                  type="button"
                  onClick={() => onInspect(s.displayName)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 font-medium text-white transition hover:bg-white/[0.12]"
                >
                  <Glyph name="history" className="h-3.5 w-3.5" />
                  {t('b.staff.seehistory')}
                </button>
              )}
              {!s.linked && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(s.id, 'reset-code')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-slate-300 transition hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
                >
                  <Glyph name="key" className="h-3.5 w-3.5" />
                  {t('b.staff.reset')}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(s.id, s.active ? 'deactivate' : 'activate')}
                className="rounded-full px-3 py-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
              >
                {s.active ? t('b.staff.disable') : t('b.staff.enable')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(s.id, 'remove')}
                aria-label={`${t('b.staff.remove')} ${s.displayName}`}
                title={t('b.staff.remove')}
                className="ml-auto grid h-8 w-8 place-items-center rounded-full text-red-300/80 transition hover:bg-red-400/10 hover:text-red-200 disabled:opacity-40"
              >
                <Glyph name="trash" className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {data?.staff.length === 0 && (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.06] text-slate-400">
            <Glyph name="team" className="h-5 w-5" />
          </span>
          <p className="text-xs text-slate-400">{t('b.staff.empty')}</p>
        </div>
      )}

      {/* Who did how much in 30 days. One series, one colour: bars in amber,
          sorted, the number and share at the end of each. Length is the
          encoding people read accurately at a glance. */}
      {(() => {
        const active = (data?.staff ?? []).filter((x) => x.linked && x.activity);
        if (active.length < 1) return null;
        const max = Math.max(...active.map((x) => x.activity?.granted30d ?? 0), 1);
        const total = active.reduce((n, x) => n + (x.activity?.granted30d ?? 0), 0);
        if (total === 0) return null;
        return (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-hero-deep/50 p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t('b.staff.chart')}</p>
              <p className="tnum text-[11px] text-slate-500">{t('b.staff.chart.total').replace('{n}', String(total))}</p>
            </div>
            <div className="mt-4 space-y-3">
              {active
                .slice()
                .sort((a, b) => (b.activity?.granted30d ?? 0) - (a.activity?.granted30d ?? 0))
                .map((x) => {
                  const n = x.activity?.granted30d ?? 0;
                  const pct = Math.round((n / max) * 100);
                  const share = Math.round((n / total) * 100);
                  return (
                    <div key={x.id} title={`${x.displayName}: ${n} (${share}%)`}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="truncate text-slate-200">{x.displayName}</span>
                        <span className="tnum ml-2 shrink-0">
                          <b className="font-display text-sm text-white">{n}</b>
                          <span className="ml-1.5 text-slate-500">{share}%</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(3, pct)}%` }}
                          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
                          className="h-full rounded-full bg-[#F7A30C]"
                        />
                      </div>
                      {(x.activity?.revoked30d ?? 0) > 0 && (
                        <p className="tnum mt-1 text-[10px] text-red-300/80">
                          {t('b.staff.revokes').replace('{n}', String(x.activity?.revoked30d))}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500">{t('b.staff.chart.note')}</p>
          </div>
        );
      })()}

      <p className="mt-5 text-[11px] leading-relaxed text-slate-500">{t('b.staff.note')}</p>
    </div>
  );
}
