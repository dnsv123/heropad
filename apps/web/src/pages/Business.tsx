import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';

import { getJson, postJson } from '../services/apiClient';
import { hapticTap } from '../services/platformService';
import { useT } from '../i18n';

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
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [setupCode, setSetupCode] = useState('');

  const [codeInput, setCodeInput] = useState('');
  const [redeemInput, setRedeemInput] = useState('');
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [analytics, setAnalytics] = useState<VenueAnalytics | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // Probe ownership by hitting a merchant endpoint with a dummy-but-valid code.
  // A 403 means "not your venue"; 404 means "you own it, code just unknown".
  const probeOwnership = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      await getJson(`/api/loyalty/merchant/${slug}/customer/ZZZZZZ`, token);
      setIsOwner(true);
    } catch (err) {
      const e = err as ApiErr & { code?: string };
      setIsOwner(e.code === 'unknown_code' ? true : e.code === 'not_merchant' ? false : null);
    }
  }, [slug, getAccessToken]);

  useEffect(() => {
    if (ready && authenticated) void probeOwnership();
  }, [ready, authenticated, probeOwnership]);

  async function handleClaimOwnership() {
    setClaiming(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      await postJson(
        `/api/loyalty/venue/${slug}/claim-ownership`,
        { setupCode: setupCode.trim().toUpperCase() },
        token ?? undefined
      );
      setIsOwner(true);
      setSetupCode('');
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
    try {
      const token = await getAccessToken();
      const r = await postJson<
        { code: string; count: number },
        { ok: true; granted: number; happyHour: number | null } & CustomerInfo
      >(
        `/api/loyalty/merchant/${slug}/grant`,
        { code: customer.code, count },
        token ?? undefined
      );
      hapticTap(15);
      setCustomer({ ...customer, stamps: r.stamps, canRedeem: r.canRedeem });
      setNotice({
        kind: 'ok',
        text:
          t('b.n.granted', { n: r.granted ?? count, s: r.stamps, r: r.required }) +
          (r.happyHour ? ` ⚡ HAPPY HOUR x${r.happyHour}` : ''),
      });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setBusy(false);
    }
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

  async function redeem() {
    if (!customer) return;
    const rc = redeemInput.trim().toUpperCase();
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
                  onClick={handleClaimOwnership}
                  disabled={claiming || setupCode.trim().length !== 8}
                  className="shrink-0 rounded-full bg-hero-gold px-5 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-40"
                >
                  {claiming ? t('b.claim.busy') : t('b.claim.btn')}
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

              {/* ---- Campaign settings (merchant self-service) ---- */}
              <div className="mt-6 border-t border-hero-blue/15 pt-4">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="w-full rounded-full border border-hero-blue/30 px-4 py-2 text-sm text-slate-300 transition hover:border-hero-gold hover:text-white"
                >
                  {settingsOpen ? t('b.settings.hide') : t('b.settings')}
                </button>
                <AnimatePresence>
                  {settingsOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ---- Venue stats (pilot merchant dashboard, PII-free) ---- */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void toggleStats()}
                  className="w-full rounded-full border border-hero-blue/30 px-4 py-2 text-sm text-slate-300 transition hover:border-hero-cyan hover:text-white"
                >
                  {statsOpen ? t('b.stats.hide') : t('b.stats')}
                </button>

                <AnimatePresence>
                  {statsOpen && analytics && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
          {t('b.footer')}
        </p>
      </div>
    </section>
  );
}
