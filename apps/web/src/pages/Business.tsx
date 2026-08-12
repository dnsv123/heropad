import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';

import { getJson, postJson } from '../services/apiClient';
import { hapticTap } from '../services/platformService';
import { playGrant, playReward, playError, isMuted, setMuted } from '../services/soundService';
import {
  enqueue,
  flush,
  isNetworkFailure,
  newRequestId,
  subscribe,
  watch,
  type QueuedGrant,
} from '../services/offlineQueue';
import { useT } from '../i18n';
import QrScanner from '../components/QrScanner';
import VenueHistory from '../components/VenueHistory';
import VenueStaff from '../components/VenueStaff';
import FolderTabs from '../components/FolderTabs';

// Business page — the barista / merchant device.
// ---------------------------------------------------------------------------
// Flow at the counter: customer shows their 6-char code → barista types it →
// sees the customer's progress → taps +1/+2/+3 (coffees bought) → customer's
// phone animates within seconds. When the card is full, the REDEEM button
// consumes the stamps as the reward is handed over.
//
// Validation-phase bootstrap: the venue seeded in Supabase has no owner; the
// first logged-in account to press "Become merchant" claims it (backend allows
// this only while owner_identity_id is null).

const VENUE_SLUG_DEFAULT = 'cafe-victor';
const CODE_RE = /^[A-Z2-9]{6}$/;

interface VenueInfo {
  slug: string;
  name: string;
  stampsRequired: number;
}

interface CustomerInfo {
  code: string;
  stamps: number;
  required: number;
  cardsCompleted: number;
  canRedeem: boolean;
}

interface ApiErr {
  code?: string;
  message: string;
}

interface VenueAnalytics {
  uniqueCustomers: number;
  totalStamps: number;
  stampsLast30: number;
  rewardsClaimed: number;
  repeatCustomers: number;
  trophiesMinted: number;
  daily: Array<{ day: string; stamps: number; customers: number }>;
  progress: { early: number; mid: number; almost: number; full: number };
}

export default function Business() {
  const [params] = useSearchParams();
  // Constrain the venue slug to the shape the API accepts — a raw query value
  // is interpolated into request paths, and `?`/`#` would reshape them.
  const rawSlug = params.get('venue') ?? VENUE_SLUG_DEFAULT;
  const slug = /^[a-z0-9-]{2,60}$/.test(rawSlug) ? rawSlug : VENUE_SLUG_DEFAULT;
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { t } = useT();

  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [role, setRole] = useState<'owner' | 'staff' | 'none' | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);
  const isOwner = role === null ? null : role === 'owner';
  const [setupCode, setSetupCode] = useState('');
  const [scanning, setScanning] = useState(false);

  const [codeInput, setCodeInput] = useState('');
  const [redeemInput, setRedeemInput] = useState('');
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [analytics, setAnalytics] = useState<VenueAnalytics | null>(null);
  const [today, setToday] = useState<{ stamps: number; rewards: number; customers: number } | null>(
    null
  );
  const [muted, setMutedState] = useState(() => isMuted());
  const [queued, setQueued] = useState<QueuedGrant[]>([]);
  const [setRequired, setSetRequired] = useState('');
  const [setReward, setSetReward] = useState('');
  const [setReview, setSetReview] = useState('');
  const [setPhone, setSetPhone] = useState('');
  const [hhDays, setHhDays] = useState<number[]>([]);
  const [hhStart, setHhStart] = useState('');
  const [hhEnd, setHhEnd] = useState('');
  const [hhMult, setHhMult] = useState(2);
  const [hhTouched, setHhTouched] = useState(false);

  const normalizedCode = codeInput.trim().toUpperCase();
  const codeValid = CODE_RE.test(normalizedCode);

  // Load public venue info.
  useEffect(() => {
    let active = true;
    getJson<{ ok: true; venue: VenueInfo }>(`/api/loyalty/venue/${slug}`)
      .then((r) => active && setVenue(r.venue))
      .catch((err: Error) => active && setNotice({ kind: 'err', text: err.message }));
    return () => {
      active = false;
    };
  }, [slug]);

  // What this account may do at this venue. Asked directly rather than
  // inferred from an error code — with staff seats, "can look up a customer"
  // no longer means "owns the place".
  const probeOwnership = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const r = await getJson<{
        ok: true;
        role: 'owner' | 'staff' | 'none';
        displayName: string | null;
      }>(`/api/loyalty/merchant/${slug}/me`, token);
      setRole(r.role);
      setStaffName(r.displayName);
    } catch {
      setRole(null);
    }
  }, [slug, getAccessToken]);

  useEffect(() => {
    if (ready && authenticated) void probeOwnership();
  }, [ready, authenticated, probeOwnership]);

  /**
   * The shift summary. Sent with the device's local midnight, because a café's
   * day ends when they close, not when UTC rolls over.
   */
  const loadToday = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const r = await getJson<{ ok: true; stamps: number; rewards: number; customers: number }>(
        `/api/loyalty/merchant/${slug}/today?since=${encodeURIComponent(midnight.toISOString())}`,
        token
      );
      setToday({ stamps: r.stamps, rewards: r.rewards, customers: r.customers });
    } catch {
      // A missing summary must never block the counter.
    }
  }, [slug, getAccessToken]);

  useEffect(() => {
    if (ready && authenticated && isOwner !== false) void loadToday();
  }, [ready, authenticated, isOwner, loadToday]);

  /**
   * One field for both kinds of code. An 8-character code makes you the owner,
   * a 6-character one puts you on the team — a distinction the person holding
   * the code should not have to make, since they were simply given a code.
   */
  async function handleCode() {
    const code = setupCode.trim().toUpperCase();
    if (code.length === 6) return handleJoinStaff(code);
    return handleClaimOwnership();
  }

  async function handleJoinStaff(code: string) {
    setClaiming(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<
        { code: string },
        { ok: true; venueSlug: string | null; venueName: string | null; displayName: string }
      >('/api/loyalty/staff/claim', { code }, token ?? undefined);
      setSetupCode('');
      // The code identifies its own venue — send them there rather than
      // leaving them on a page for a café they are not on the team of.
      if (r.venueSlug && r.venueSlug !== slug) {
        window.location.href = `/business?venue=${r.venueSlug}`;
        return;
      }
      setRole('staff');
      setStaffName(r.displayName);
      setNotice({ kind: 'ok', text: t('b.staffclaim.ok', { name: r.venueName ?? '' }) });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setClaiming(false);
    }
  }

  async function handleClaimOwnership() {
    setClaiming(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<
        { setupCode: string },
        { ok: true; slug?: string; name?: string; redirected?: boolean }
      >(
        `/api/loyalty/venue/${slug}/claim-ownership`,
        { setupCode: setupCode.trim().toUpperCase() },
        token ?? undefined
      );
      setSetupCode('');
      // The code may have belonged to another venue — the API resolves it and
      // tells us where the merchant actually landed, so we switch them there.
      if (r.redirected && r.slug && r.slug !== slug) {
        window.location.href = `/business?venue=${r.slug}`;
        return;
      }
      setRole('owner');
      setNotice({ kind: 'ok', text: 'You are now the merchant of this venue. ☕' });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setClaiming(false);
    }
  }

  async function lookupCustomer(code: string) {
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await getJson<{ ok: true } & CustomerInfo>(
        `/api/loyalty/merchant/${slug}/customer/${code}`,
        token ?? undefined
      );
      setCustomer(r);
    } catch (err) {
      setCustomer(null);
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setBusy(false);
    }
  }

  async function grant(count: number) {
    if (!customer) return;
    setBusy(true);
    setNotice(null);
    // One id per tap, reused by any retry, so a grant whose reply was lost to
    // a dropped connection cannot become two stamps.
    const requestId = newRequestId();
    try {
      const token = await getAccessToken();
      const r = await postJson<
        { code: string; count: number; requestId: string },
        { ok: true; granted: number; happyHour: number | null } & CustomerInfo
      >(
        `/api/loyalty/merchant/${slug}/grant`,
        { code: customer.code, count, requestId },
        token ?? undefined
      );
      hapticTap(15);
      // The card completing is the moment worth hearing across the bar.
      if (r.canRedeem) playReward();
      else playGrant();
      setCustomer({ ...customer, stamps: r.stamps, canRedeem: r.canRedeem });
      void loadToday();
      setNotice({
        kind: 'ok',
        text:
          t('b.n.granted', { n: r.granted ?? count, s: r.stamps, r: r.required }) +
          (r.happyHour ? ` ⚡ HAPPY HOUR x${r.happyHour}` : ''),
      });
    } catch (err) {
      if (isNetworkFailure(err)) {
        // The request never reached the server. Hold it and tell the barista
        // the customer is covered, because they are — it will be sent.
        enqueue({ id: requestId, slug, code: customer.code, count });
        playGrant();
        hapticTap(15);
        setNotice({ kind: 'ok', text: t('b.queued') });
      } else {
        playError();
        setNotice({ kind: 'err', text: (err as ApiErr).message });
      }
    } finally {
      setBusy(false);
    }
  }

  /** Send whatever is waiting. Safe to call often — the server dedupes. */
  const drainQueue = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const { sent } = await flush(async (entry) => {
      await postJson(
        `/api/loyalty/merchant/${entry.slug}/grant`,
        { code: entry.code, count: entry.count, requestId: entry.id },
        token
      );
    });
    if (sent > 0) {
      setNotice({ kind: 'ok', text: t('b.queued.sent', { n: sent }) });
      void loadToday();
    }
  }, [getAccessToken, t, loadToday]);

  useEffect(() => subscribe(setQueued), []);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void drainQueue();
    return watch(() => void drainQueue());
  }, [ready, authenticated, drainQueue]);

  /**
   * One scanner for both code kinds: HPC = the customer's permanent code
   * (look them up), HPR = a one-time reward code (redeem straight away). A
   * bare 6-char code is treated as a customer code so hand-typed or older
   * QRs still work.
   */
  function handleScan(raw: string) {
    setScanning(false);
    const text = raw.trim().toUpperCase();
    const reward = text.startsWith('HPR:') ? text.slice(4) : null;
    const customerCode = text.startsWith('HPC:') ? text.slice(4) : CODE_RE.test(text) ? text : null;

    if (reward && CODE_RE.test(reward)) {
      setRedeemInput(reward);
      hapticTap(15);
      if (customer) void redeemWith(reward);
      else setNotice({ kind: 'ok', text: t('b.n.scan.reward') });
      return;
    }
    if (customerCode && CODE_RE.test(customerCode)) {
      setCodeInput(customerCode);
      hapticTap(15);
      void lookupCustomer(customerCode);
      return;
    }
    setNotice({ kind: 'err', text: t('b.n.scan.unknown') });
  }

  async function revokeOne() {
    if (!customer) return;
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<
        { code: string },
        { ok: true; stamps: number; canRedeem: boolean }
      >(`/api/loyalty/merchant/${slug}/revoke`, { code: customer.code }, token ?? undefined);
      hapticTap(10);
      setCustomer({ ...customer, stamps: r.stamps, canRedeem: r.canRedeem });
      setNotice({
        kind: 'ok',
        text: t('b.n.corrected', { s: r.stamps, r: customer.required }),
      });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const body: {
        stampsRequired?: number;
        rewardLabel?: string;
        reviewUrl?: string;
        phone?: string;
        happyHour?: { days: number[]; start: string; end: string; mult: number } | null;
      } = {};
      const n = parseInt(setRequired, 10);
      if (!Number.isNaN(n)) body.stampsRequired = n;
      if (setReward.trim().length >= 2) body.rewardLabel = setReward.trim();
      if (setReview.trim().length > 0) body.reviewUrl = setReview.trim();
      if (setPhone.trim().length > 0) body.phone = setPhone.trim();
      if (hhTouched) {
        body.happyHour =
          hhDays.length > 0 && hhStart && hhEnd
            ? { days: hhDays, start: hhStart, end: hhEnd, mult: hhMult }
            : null;
      }
      if (Object.keys(body).length === 0) {
        setNotice({ kind: 'err', text: t('b.n.nothing') });
        return;
      }
      const r = await postJson<
        typeof body,
        { ok: true; venue: { stampsRequired: number; rewardLabel: string | null } }
      >(`/api/loyalty/merchant/${slug}/settings`, body, token ?? undefined);
      hapticTap(15);
      setVenue((v) => (v ? { ...v, stampsRequired: r.venue.stampsRequired } : v));
      setCustomer(null);
      setNotice({ kind: 'ok', text: t('b.n.saved.gen') });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStats() {
    const next = !statsOpen;
    setStatsOpen(next);
    if (next && !analytics) {
      try {
        const token = await getAccessToken();
        const r = await getJson<{ ok: true } & VenueAnalytics>(
          `/api/loyalty/merchant/${slug}/stats`,
          token ?? undefined
        );
        setAnalytics(r);
      } catch (err) {
        setNotice({ kind: 'err', text: (err as ApiErr).message });
        setStatsOpen(false);
      }
    }
  }

  function redeem() {
    return redeemWith(redeemInput);
  }

  async function redeemWith(code: string) {
    if (!customer) return;
    const rc = code.trim().toUpperCase();
    if (!CODE_RE.test(rc)) {
      setNotice({ kind: 'err', text: t('b.n.askcode') });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<
        { redeemCode: string },
        {
          ok: true;
          stamps: number;
          cardsCompleted: number;
          trophy: { assetId: string } | null;
          trophySkipped: string | null;
        }
      >(`/api/loyalty/merchant/${slug}/redeem`, { redeemCode: rc }, token ?? undefined);
      hapticTap(30);
      setRedeemInput('');
      setCustomer({
        ...customer,
        stamps: r.stamps,
        canRedeem: r.stamps >= customer.required,
        cardsCompleted: r.cardsCompleted,
      });
      setNotice({
        kind: 'ok',
        text: r.trophy
          ? t('b.n.redeemed.trophy')
          : `${t('b.n.redeemed')} ${r.trophySkipped ?? ''}`,
      });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />

      <div className="mx-auto max-w-xl px-6 py-10 md:py-16">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-hero-gold">Business</p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
            {venue?.name ?? '…'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{t('b.sub')}</p>
        </div>

        <div className="mt-8 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6 backdrop-blur md:p-8">
          {!ready ? null : !authenticated ? (
            <div className="text-center">
              <p className="mb-3 text-sm text-slate-400">
                {t('b.login.hint', { name: venue?.name ?? '…' })}
              </p>
              <button
                type="button"
                onClick={login}
                className="rounded-full bg-solana-purple px-6 py-2.5 font-medium text-white shadow-hero-purple transition hover:bg-solana-purple-deep"
              >
                {t('b.login.btn')}
              </button>
            </div>
          ) : isOwner === false ? (
            <div className="text-center">
              <p className="mb-3 text-sm text-slate-400">
                {t('b.notmerchant', { name: venue?.name ?? '…' })}
              </p>
              <p className="mb-3 text-xs text-slate-500">
                {t('b.anycode.hint')}
              </p>
              <div className="mx-auto mt-3 flex max-w-xs items-stretch gap-2">
                <input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={8}
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value.toUpperCase())}
                  placeholder={t('b.setupcode.ph')}
                  className="min-w-0 flex-1 rounded-lg border border-hero-gold/40 bg-hero-deep/80 px-3 py-2.5 text-center font-mono text-lg tracking-[0.2em] text-hero-gold placeholder:text-slate-700 focus:border-hero-gold focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCode()}
                  disabled={
                    claiming ||
                    (setupCode.trim().length !== 8 && setupCode.trim().length !== 6)
                  }
                  className="shrink-0 rounded-full bg-hero-gold px-5 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-40"
                >
                  {claiming
                    ? t('b.claim.busy')
                    : setupCode.trim().length === 6
                      ? t('b.staffclaim.go')
                      : t('b.claim.btn')}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-600">{t('b.setupcode.hint')}</p>
              <button
                type="button"
                onClick={logout}
                className="mt-3 text-xs text-slate-400 underline"
              >
                {t('b.switch')}
              </button>
            </div>
          ) : (
            <>
              {queued.length > 0 && (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-hero-gold/40 bg-hero-gold/10 px-4 py-2.5">
                  <p className="text-xs text-hero-gold">
                    ⏳ {t('b.queued.n', { n: queued.length })}
                  </p>
                  <button
                    type="button"
                    onClick={() => void drainQueue()}
                    className="shrink-0 rounded-full border border-hero-gold/40 px-3 py-1 text-[11px] text-hero-gold transition hover:bg-hero-gold hover:text-hero-deep"
                  >
                    {t('b.queued.retry')}
                  </button>
                </div>
              )}

              {/* Shift summary — the first thing an owner wants in the morning,
                  and the running total a barista glances at during service. */}
              <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-hero-blue/20 bg-hero-deep/60 px-4 py-2.5">
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">{t('b.today')}</span>
                  <span className="text-hero-cyan">
                    <b className="font-display text-base">{today?.stamps ?? 0}</b>{' '}
                    {t('b.today.stamps')}
                  </span>
                  <span className="text-hero-gold">
                    <b className="font-display text-base">{today?.rewards ?? 0}</b>{' '}
                    {t('b.today.rewards')}
                  </span>
                  <span className="hidden text-slate-400 sm:inline">
                    <b className="font-display text-base">{today?.customers ?? 0}</b>{' '}
                    {t('b.today.customers')}
                  </span>
                </div>
                {/* A café that finds the tone annoying would otherwise mute the
                    whole phone and lose the haptics with it. */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    setMutedState(next);
                    if (!next) playGrant();
                  }}
                  title={muted ? t('b.sound.on') : t('b.sound.off')}
                  className="shrink-0 rounded-full border border-hero-blue/25 px-2.5 py-1 text-sm text-slate-400 transition hover:border-hero-cyan hover:text-white"
                >
                  {muted ? '🔇' : '🔊'}
                </button>
              </div>

              {/* Customer code entry */}
              <label htmlFor="code" className="text-xs uppercase tracking-wider text-slate-500">
                {t('b.code.label')}
              </label>
              <div className="mt-2 flex items-stretch gap-2">
                <input
                  id="code"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value.toUpperCase());
                    setCustomer(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && codeValid) void lookupCustomer(normalizedCode);
                  }}
                  placeholder="K7M3PQ"
                  className="min-w-0 flex-1 rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-3 text-center font-mono text-xl tracking-[0.2em] text-slate-100 placeholder:text-slate-700 focus:border-hero-cyan focus:outline-none focus:ring-1 focus:ring-hero-cyan sm:px-4 sm:text-2xl sm:tracking-[0.3em]"
                />
                <button
                  type="button"
                  disabled={!codeValid || busy}
                  onClick={() => void lookupCustomer(normalizedCode)}
                  className="shrink-0 rounded-lg bg-hero-blue px-4 font-medium text-white transition hover:bg-hero-blue-bright disabled:opacity-40"
                >
                  {t('b.find')}
                </button>
              </div>

              {/* Reverse scan — the fast path at a busy counter. */}
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="mt-2 w-full rounded-full border border-hero-cyan/40 py-2.5 text-sm font-semibold text-hero-cyan transition hover:border-hero-cyan hover:bg-hero-cyan/10"
              >
                {t('b.scan.btn')}
              </button>

              {/* Customer card */}
              <AnimatePresence mode="wait">
                {customer && (
                  <motion.div
                    key={customer.code}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-6 rounded-xl border border-hero-blue/20 bg-hero-deep/60 p-5"
                  >
                    <div className="flex items-baseline justify-between">
                      <p className="font-mono text-lg tracking-[0.25em] text-hero-cyan">
                        {customer.code}
                      </p>
                      <p className="font-display text-2xl font-bold">
                        <span className={customer.canRedeem ? 'text-hero-gold' : 'text-white'}>
                          {customer.stamps}
                        </span>
                        <span className="text-slate-500"> / {customer.required}</span>
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-xs text-slate-500">{t('b.coffees')}</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3].map((n) => (
                          <button
                            key={n}
                            type="button"
                            disabled={busy}
                            onClick={() => void grant(n)}
                            className="rounded-full border border-hero-cyan/40 py-2.5 font-semibold text-hero-cyan transition hover:border-hero-cyan hover:bg-hero-cyan/10 disabled:opacity-40"
                          >
                            +{n}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void revokeOne()}
                          title="Correction: remove the last stamp from today"
                          className="rounded-full border border-red-400/40 py-2.5 font-semibold text-red-300 transition hover:border-red-400 hover:bg-red-400/10 disabled:opacity-40"
                        >
                          −1
                        </button>
                      </div>
                      <p className="mt-1.5 text-[10px] text-slate-600">{t('b.minus.note')}</p>
                    </div>

                    {customer.canRedeem && (
                      <div className="mt-4 rounded-xl border border-hero-gold/40 bg-hero-gold/10 p-3">
                        <p className="text-xs text-hero-gold">{t('b.cardfull')}</p>
                        <div className="mt-2 flex items-stretch gap-2">
                          <input
                            type="text"
                            inputMode="text"
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={6}
                            value={redeemInput}
                            onChange={(e) => setRedeemInput(e.target.value.toUpperCase())}
                            placeholder="REWARD"
                            className="min-w-0 flex-1 rounded-lg border border-hero-gold/40 bg-hero-deep/80 px-3 py-2 text-center font-mono text-lg tracking-[0.2em] text-hero-gold placeholder:text-slate-700 focus:border-hero-gold focus:outline-none sm:text-xl sm:tracking-[0.25em]"
                          />
                          <button
                            type="button"
                            disabled={busy || !CODE_RE.test(redeemInput)}
                            onClick={() => void redeem()}
                            className="shrink-0 rounded-full bg-hero-gold px-4 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-40"
                          >
                            {t('b.redeem')}
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Feedback */}
              {notice && (
                <p
                  className={`mt-4 rounded-xl border p-3 text-center text-sm ${
                    notice.kind === 'ok'
                      ? 'border-solana-green/30 bg-solana-green/10 text-solana-green'
                      : 'border-red-500/30 bg-red-500/10 text-red-200'
                  }`}
                >
                  {notice.text}
                </p>
              )}

              {/* Folders are the owner's. Staff get the counter and their
                  shift summary; the history is partly a record OF them. */}
              {role === 'staff' && (
                <p className="mt-6 rounded-2xl border border-hero-blue/15 bg-hero-deep/60 px-4 py-3 text-center text-xs text-slate-500">
                  {t('b.staffmode', { name: staffName ?? '' })}
                </p>
              )}
              {role === 'owner' && (
              <FolderTabs
                initial="team"
                onOpen={(k) => {
                  // Stats are a network call; fetch them the first time the
                  // folder is actually opened rather than on page load.
                  if (k === 'stats' && !analytics) void toggleStats();
                }}
                tabs={[
                  {
                    key: 'team',
                    icon: '👥',
                    label: t('b.tab.team'),
                    render: () => <VenueStaff slug={slug} />,
                  },
                  {
                    key: 'stats',
                    icon: '📊',
                    label: t('b.tab.stats'),
                    render: () =>
                      analytics ? (
                        <div>
                          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          { v: analytics.uniqueCustomers, l: t('b.stats.unique') },
                          { v: analytics.stampsLast30, l: t('b.stats.30') },
                          { v: analytics.rewardsClaimed, l: t('b.stats.rewards') },
                          {
                            v:
                              analytics.uniqueCustomers > 0
                                ? `${Math.round(
                                    (analytics.repeatCustomers /
                                      analytics.uniqueCustomers) *
                                      100
                                  )}%`
                                : '—',
                            l: t('b.stats.repeat'),
                          },
                        ].map((t) => (
                          <div
                            key={t.l}
                            className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3 text-center"
                          >
                            <p className="font-display text-xl font-bold text-hero-cyan">
                              {t.v}
                            </p>
                            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                              {t.l}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Daily activity — CSS bars, most recent 14 active days */}
                      {analytics.daily.length > 0 && (
                        <div className="mt-4 rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            {t('b.stats.daily')}
                          </p>
                          <div className="mt-2 flex h-20 items-end gap-1">
                            {analytics.daily.map((d) => {
                              const max = Math.max(
                                ...analytics.daily.map((x) => x.stamps)
                              );
                              return (
                                <div
                                  key={d.day}
                                  title={`${d.day}: ${d.stamps} stamps, ${d.customers} customers`}
                                  className="flex-1 rounded-t bg-gradient-to-t from-hero-blue to-hero-cyan"
                                  style={{
                                    height: `${Math.max(8, (d.stamps / max) * 100)}%`,
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Progress buckets — "how close are customers to a reward" */}
                      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                        {[
                          { v: analytics.progress.early, l: t('b.stats.starting') },
                          { v: analytics.progress.mid, l: t('b.stats.halfway') },
                          { v: analytics.progress.almost, l: t('b.stats.almost') },
                          { v: analytics.progress.full, l: t('b.stats.full') },
                        ].map((b) => (
                          <div
                            key={b.l}
                            className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-2"
                          >
                            <p className="font-display text-lg font-bold text-hero-gold">
                              {b.v}
                            </p>
                            <p className="text-[10px] text-slate-500">{b.l}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-center text-[10px] text-slate-600">
                        {t('b.stats.pii')}
                      </p>
                        </div>
                      ) : (
                        <p className="py-6 text-center text-xs text-slate-500">
                          {t('b.hist.loading')}
                        </p>
                      ),
                  },
                  {
                    key: 'history',
                    icon: '🧾',
                    label: t('b.tab.hist'),
                    render: () => <VenueHistory slug={slug} embedded />,
                  },
                  {
                    key: 'settings',
                    icon: '⚙️',
                    label: t('b.tab.set'),
                    render: () => (
                      <div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-slate-500">
                          {t('b.set.required')}
                          <input
                            type="number"
                            min={3}
                            max={30}
                            value={setRequired}
                            onChange={(e) => setSetRequired(e.target.value)}
                            placeholder={String(venue?.stampsRequired ?? 10)}
                            className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          {t('b.set.reward')}
                          <input
                            type="text"
                            maxLength={60}
                            value={setReward}
                            onChange={(e) => setSetReward(e.target.value)}
                            placeholder="A free coffee"
                            className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                          />
                        </label>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-slate-500">
                          {t('b.set.review')}
                          <input
                            type="url"
                            maxLength={300}
                            value={setReview}
                            onChange={(e) => setSetReview(e.target.value)}
                            placeholder="https://g.page/r/..."
                            className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          {t('b.set.phone')}
                          <input
                            type="tel"
                            maxLength={20}
                            value={setPhone}
                            onChange={(e) => setSetPhone(e.target.value)}
                            placeholder="+40 7xx xxx xxx"
                            className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                          />
                        </label>
                      </div>

                      {/* Happy Hour scheduler */}
                      <div className="mt-3 rounded-xl border border-hero-gold/30 bg-hero-gold/5 p-3">
                        <p className="text-xs font-semibold text-hero-gold">{t('b.set.hh')}</p>
                        <div className="mt-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            {t('b.set.hh.days')}
                          </p>
                          <div className="mt-1 grid grid-cols-7 gap-1">
                            {t('b.days')
                              .split(',')
                              .map((label, day) => (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    setHhTouched(true);
                                    setHhDays((d) =>
                                      d.includes(day)
                                        ? d.filter((x) => x !== day)
                                        : [...d, day]
                                    );
                                  }}
                                  className={`rounded-lg border py-1.5 text-[11px] font-semibold transition ${
                                    hhDays.includes(day)
                                      ? 'border-hero-gold bg-hero-gold text-hero-deep'
                                      : 'border-hero-blue/30 text-slate-400 hover:border-hero-gold/50'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <label className="text-[10px] uppercase tracking-wider text-slate-500">
                            {t('b.set.hh.from')}
                            <input
                              type="time"
                              value={hhStart}
                              onChange={(e) => {
                                setHhTouched(true);
                                setHhStart(e.target.value);
                              }}
                              className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-2 py-1.5 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                            />
                          </label>
                          <label className="text-[10px] uppercase tracking-wider text-slate-500">
                            {t('b.set.hh.to')}
                            <input
                              type="time"
                              value={hhEnd}
                              onChange={(e) => {
                                setHhTouched(true);
                                setHhEnd(e.target.value);
                              }}
                              className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-2 py-1.5 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                            />
                          </label>
                          <label className="text-[10px] uppercase tracking-wider text-slate-500">
                            {t('b.set.hh.mult')}
                            <select
                              value={hhMult}
                              onChange={(e) => {
                                setHhTouched(true);
                                setHhMult(Number(e.target.value));
                              }}
                              className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-2 py-1.5 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                            >
                              <option value={2}>x2</option>
                              <option value={3}>x3</option>
                            </select>
                          </label>
                        </div>
                        <p className="mt-1.5 text-[10px] text-slate-600">{t('b.set.hh.hint')}</p>
                      </div>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveSettings()}
                        className="mt-3 w-full rounded-full bg-hero-gold px-4 py-2 text-sm font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-50"
                      >
                        {t('b.set.save')}
                      </button>
                      <p className="mt-1.5 text-center text-[10px] text-slate-600">
                        {t('b.set.note')}
                      </p>
                      </div>
                    ),
                  },
                ]}
              />
              )}
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
          {t('b.footer')}
        </p>

        {scanning && (
          <QrScanner
            title={t('b.scan.title')}
            hint={t('b.scan.hint')}
            onResult={handleScan}
            onClose={() => setScanning(false)}
          />
        )}
      </div>
    </section>
  );
}
