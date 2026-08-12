import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';

import { getJson, postJson, type ApiClientError } from '../services/apiClient';
import { useT } from '../i18n';

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

  const seatsLeft = data ? data.seats - data.used : 0;
  const full = data ? seatsLeft <= 0 : false;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-white">{t('b.staff.title')}</h3>
        {data && (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
              full
                ? 'border-hero-gold/40 bg-hero-gold/10 text-hero-gold'
                : 'border-hero-blue/25 text-slate-400'
            }`}
          >
            {t('b.staff.seats').replace('{u}', String(data.used)).replace('{s}', String(data.seats))}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t('b.staff.why')}</p>

      {/* The code, front and centre, right after it is issued. */}
      <AnimatePresence>
        {justAdded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-2xl border border-hero-gold/40 bg-hero-gold/10 p-4 text-center"
          >
            <p className="text-xs text-hero-gold">
              {t('b.staff.codefor').replace('{name}', justAdded.name)}
            </p>
            <button
              type="button"
              onClick={() => copy(justAdded.code)}
              className="mt-2 font-mono text-3xl font-bold tracking-[0.35em] text-hero-gold-bright"
            >
              {justAdded.code}
            </button>
            <p className="mt-2 text-[11px] text-slate-400">{t('b.staff.codehint')}</p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => copy(justAdded.code)}
                className="rounded-full bg-hero-gold px-3 py-1 text-xs font-semibold text-hero-deep"
              >
                {copied === justAdded.code ? t('b.staff.copied') : t('b.staff.copy')}
              </button>
              <button
                type="button"
                onClick={() => setJustAdded(null)}
                className="rounded-full border border-hero-gold/40 px-3 py-1 text-xs text-hero-gold"
              >
                {t('b.staff.done')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add */}
      <div className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          disabled={full}
          placeholder={t('b.staff.placeholder')}
          maxLength={40}
          className="min-w-0 flex-1 rounded-xl border border-hero-blue/25 bg-hero-deep/70 px-3 py-2 text-sm text-white placeholder:text-slate-600 disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || full || name.trim().length < 2}
          className="shrink-0 rounded-xl bg-hero-cyan px-4 py-2 text-sm font-semibold text-hero-deep transition hover:brightness-110 disabled:opacity-40"
        >
          {t('b.staff.add')}
        </button>
      </div>
      {full && <p className="mt-2 text-[11px] text-hero-gold">{t('b.staff.full')}</p>}

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {/* List */}
      <ul className="mt-4 space-y-2">
        {(data?.staff ?? []).map((s) => (
          <li
            key={s.id}
            className={`rounded-xl border px-3 py-2.5 ${
              s.active ? 'border-hero-blue/20 bg-hero-deep/60' : 'border-slate-700/40 bg-hero-deep/30'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`truncate text-sm ${s.active ? 'text-white' : 'text-slate-500'}`}>
                  {s.displayName}
                </p>
                <p className="mt-0.5 text-[10px]">
                  {s.linked ? (
                    <span className="text-solana-green">✓ {t('b.staff.linked')}</span>
                  ) : s.activationCode ? (
                    <button
                      type="button"
                      onClick={() => copy(s.activationCode as string)}
                      className="font-mono tracking-widest text-hero-gold underline-offset-2 hover:underline"
                    >
                      {copied === s.activationCode ? t('b.staff.copied') : s.activationCode} ⧉
                    </button>
                  ) : (
                    <span className="text-slate-600">{t('b.staff.nocode')}</span>
                  )}
                  {!s.active && ` · ${t('b.staff.off')}`}
                </p>
                {s.linked && s.activity && (
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-slate-500">
                    <span className="text-hero-cyan">
                      {t('b.staff.act').replace('{n}', String(s.activity.granted30d))}
                    </span>
                    {s.activity.grantedToday > 0 && (
                      <span>{t('b.staff.acttoday').replace('{n}', String(s.activity.grantedToday))}</span>
                    )}
                    {s.activity.revoked30d > 0 && (
                      <span className="text-red-300/80">
                        {t('b.staff.revokes').replace('{n}', String(s.activity.revoked30d))}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5 text-[11px]">
                {s.linked && onInspect && (
                  <button
                    type="button"
                    onClick={() => onInspect(s.displayName)}
                    // Words, not a magnifier. An icon here reads as "search
                    // something" when what it does is open another folder.
                    className="rounded-full border border-hero-cyan/40 px-3 py-1 font-medium text-hero-cyan transition hover:bg-hero-cyan hover:text-hero-deep"
                  >
                    {t('b.staff.seehistory')} →
                  </button>
                )}
                {!s.linked && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(s.id, 'reset-code')}
                    className="rounded-full border border-hero-blue/30 px-2.5 py-1 text-slate-400 transition hover:border-hero-cyan hover:text-white disabled:opacity-40"
                  >
                    ↻
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(s.id, s.active ? 'deactivate' : 'activate')}
                  className="rounded-full border border-hero-blue/30 px-2.5 py-1 text-slate-400 transition hover:border-hero-cyan hover:text-white disabled:opacity-40"
                >
                  {s.active ? t('b.staff.disable') : t('b.staff.enable')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(s.id, 'remove')}
                  className="rounded-full border border-red-400/30 px-2.5 py-1 text-red-300/80 transition hover:bg-red-400/10 disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {data?.staff.length === 0 && (
        <p className="mt-4 rounded-xl border border-hero-blue/15 bg-hero-deep/60 px-3 py-6 text-center text-xs text-slate-500">
          {t('b.staff.empty')}
        </p>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-slate-600">{t('b.staff.note')}</p>
    </div>
  );
}
