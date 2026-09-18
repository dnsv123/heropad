import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '../lib/auth';

import { getJson, postJson } from '../services/apiClient';
import { hapticTap } from '../services/platformService';
import {
  playGrant,
  playReward,
  playError,
  primeAudio,
  isMuted,
  setMuted,
} from '../services/soundService';
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
  /** Full branding jsonb — seeds the settings form with what is saved. */
  branding?: Record<string, unknown> | null;
  timezone?: string | null;
}

interface CustomerInfo {
  code: string;
  stamps: number;
  required: number;
  cardsCompleted: number;
  canRedeem: boolean;
  /** Computed server-side in the venue's time zone; the date never arrives. */
  birthdayToday?: boolean;
  /** Rewards claimed with BITS that can be handed over at THIS counter. */
  rewards?: Array<{ code: string; itemName: string; imageUrl: string | null; priceBits: number }>;
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
  /** Owner or staff: this account may work the counter here. */
  const canServe = role === 'owner' || role === 'staff';
  // An invite link carries the code (?code=ABC123): the field starts filled
  // and the new barista only has to press the button.
  const [setupCode, setSetupCode] = useState(() => {
    const c = (params.get('code') ?? '').toUpperCase();
    return /^[A-Z0-9]{6,8}$/.test(c) ? c : '';
  });
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
  /** Set from the Team folder; opens History narrowed to that person. */
  const [inspectStaff, setInspectStaff] = useState('');
  const [folderTab, setFolderTab] = useState('team');
  const [setRequired, setSetRequired] = useState('');
  const [setReward, setSetReward] = useState('');
  const [setReview, setSetReview] = useState('');
  const [setPhone, setSetPhone] = useState('');
  const [setEmail, setSetEmail] = useState('');
  const [setInsta, setSetInsta] = useState('');
  const [setFb, setSetFb] = useState('');
  const [setSite, setSetSite] = useState('');
  /**
   * "What's on this week". Tracked with a touched flag like Happy Hour,
   * because unlike the contact fields this one must be *clearable*: after the
   * concert is over, an empty field has to mean "take it down", not "leave
   * what was there".
   */
  const [setAnnounce, setSetAnnounce] = useState('');
  const [announceTouched, setAnnounceTouched] = useState(false);
  const [annKind, setAnnKind] = useState<'news' | 'offer' | 'event'>('news');
  /** "Order ahead" link — touched flag so an emptied field clears it. */
  const [setOrder, setSetOrder] = useState('');
  const [orderTouched, setOrderTouched] = useState(false);
  /** BITS reward hand-over: the 6-character code the customer reads out. */
  const [rewardCode, setRewardCode] = useState('');
  const [rewardBusy, setRewardBusy] = useState(false);
  const [hhDays, setHhDays] = useState<number[]>([]);
  const [hhStart, setHhStart] = useState('');
  const [hhEnd, setHhEnd] = useState('');
  const [hhMult, setHhMult] = useState(2);
  const [hhTouched, setHhTouched] = useState(false);
  /**
   * The venue's own clock. Happy Hour used to be evaluated in Bucharest for
   * everyone, so a café abroad set a window and watched it never fire.
   * Defaults to the device's zone, which is right far more often than a
   * hardcoded country was.
   */
  const [tz, setTz] = useState('');

  const normalizedCode = codeInput.trim().toUpperCase();
  const codeValid = CODE_RE.test(normalizedCode);

  // --- Figurine check-ins (NFC Faza 2a) --------------------------------------
  // Customers who tapped the figurine in the last minutes; the barista taps
  // "Load" instead of typing a code. Polled lightly, only while the counter
  // is actually open and looked at; entries expire server-side after 3 min.
  const [checkins, setCheckins] = useState<Array<{ code: string; secondsAgo: number }>>([]);
  // Zero-click serve: when the counter is IDLE (no customer loaded, nothing
  // being typed), the newest tap loads itself — the barista looks down and the
  // card is already there, +2 away from done. Never auto-switches away from a
  // customer already on screen, and never fights half-typed input. Refs keep
  // the 5s poll honest about state without re-arming the interval.
  const customerRef = useRef(customer);
  customerRef.current = customer;
  const codeInputRef = useRef(codeInput);
  codeInputRef.current = codeInput;
  const autoLoaded = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!canServe) return;
    let active = true;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await getJson<{ ok: true; checkins: Array<{ code: string; secondsAgo: number }> }>(
          `/api/loyalty/merchant/${slug}/checkins`,
          token
        );
        if (!active) return;
        setCheckins(r.checkins);
        const newest = r.checkins[0];
        if (
          newest &&
          !customerRef.current &&
          codeInputRef.current.trim() === '' &&
          !autoLoaded.current.has(newest.code)
        ) {
          autoLoaded.current.add(newest.code);
          setCodeInput(newest.code);
          void lookupCustomer(newest.code);
        }
      } catch {
        /* a missed poll is just a missed poll */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lookupCustomer is stable-enough; refs carry live state
  }, [canServe, slug, getAccessToken]);

  // Load public venue info — and seed the settings form with what is already
  // saved. The form used to start blank and stay blank, so after a refresh a
  // configured Happy Hour looked "unselected", as if it did not exist
  // (Dumitru's bug); the same applied to reward, review link and contact.
  useEffect(() => {
    let active = true;
    getJson<{ ok: true; venue: VenueInfo }>(`/api/loyalty/venue/${slug}`)
      .then((r) => {
        if (!active) return;
        setVenue(r.venue);
        const b = r.venue.branding ?? {};
        const str = (v: unknown) => (typeof v === 'string' ? v : '');
        setSetRequired(String(r.venue.stampsRequired ?? ''));
        setSetReward(str(b.reward));
        setSetReview(str(b.reviewUrl));
        setSetPhone(str(b.phone));
        setSetEmail(str(b.email));
        setSetInsta(str(b.instagram));
        setSetFb(str(b.facebook));
        setSetSite(str(b.website));
        setSetAnnounce(str(b.announcement));
        const k = str(b.announcementKind);
        if (k === 'offer' || k === 'event' || k === 'news') setAnnKind(k);
        setSetOrder(str(b.orderUrl));
        if (typeof r.venue.timezone === 'string') setTz(r.venue.timezone);
        const hh = b.happyHour as
          | { days?: number[]; start?: string; end?: string; mult?: number }
          | undefined;
        if (hh && Array.isArray(hh.days) && hh.days.length > 0) {
          setHhDays(hh.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
          setHhStart(str(hh.start));
          setHhEnd(str(hh.end));
          setHhMult(Number(hh.mult) === 3 ? 3 : 2);
        }
      })
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
    if (ready && authenticated && canServe) void loadToday();
  }, [ready, authenticated, canServe, loadToday]);

  /**
   * One field for both kinds of code, and the person holding one should not
   * have to know which it is. Both are now 8 characters from the same alphabet
   * (the security audit lengthened the team code), so length cannot tell them
   * apart any more. The seat is tried first — nine codes out of ten are seats
   * — and only a "no such code" answer falls through to the owner claim. A
   * rate-limit answer is shown as is, never retried.
   */
  async function handleCode() {
    const code = setupCode.trim().toUpperCase();
    if (code.length === 6) return handleJoinStaff(code);
    try {
      await handleJoinStaff(code, { quiet: true });
      return;
    } catch (err) {
      const e = err as ApiErr;
      if (e.code !== 'bad_code') {
        setNotice({ kind: 'err', text: e.message });
        return;
      }
    }
    try {
      await handleClaimOwnership({ quiet: true });
    } catch (err) {
      const e = err as ApiErr;
      setNotice({
        kind: 'err',
        text: e.code === 'bad_setup_code' ? t('b.code.invalid') : e.message,
      });
    }
  }

  /** `quiet`: rethrow instead of showing the error — the caller decides. */
  async function handleJoinStaff(code: string, opts: { quiet?: boolean } = {}) {
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
      if (opts.quiet) throw err;
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setClaiming(false);
    }
  }

  async function handleClaimOwnership(opts: { quiet?: boolean } = {}) {
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
      if (opts.quiet) throw err;
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setClaiming(false);
    }
  }

  /**
   * Hand a BITS reward over. Called with a code when it comes from the
   * customer's own card (one tap, no typing) and without one when the
   * barista typed it into the fallback field.
   */
  async function fulfilReward(fromCard?: string) {
    const code = (fromCard ?? rewardCode).trim().toUpperCase();
    if (!CODE_RE.test(code)) return;
    setRewardBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<
        { code: string },
        { ok: true; item: { name: string }; priceBits: number }
      >(`/api/rewards/counter/${slug}/fulfil`, { code }, token ?? undefined);
      hapticTap(20);
      setRewardCode('');
      setNotice({ kind: 'ok', text: t('b.rw.ok', { item: r.item.name, n: r.priceBits }) });
      // The button just pressed must disappear: drop that claim from the
      // loaded customer without a round trip.
      setCustomer((c) =>
        c ? { ...c, rewards: (c.rewards ?? []).filter((x) => x.code !== code) } : c
      );
    } catch (err) {
      setNotice({ kind: 'err', text: (err as Error).message });
    } finally {
      setRewardBusy(false);
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

  async function revokeOne(count = 1) {
    if (!customer) return;
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<
        { code: string; count: number },
        { ok: true; stamps: number; canRedeem: boolean }
      >(
        `/api/loyalty/merchant/${slug}/revoke`,
        { code: customer.code, count },
        token ?? undefined
      );
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
        timezone?: string;
        email?: string;
        instagram?: string;
        facebook?: string;
        website?: string;
        announcement?: string;
        announcementKind?: 'news' | 'offer' | 'event';
        orderUrl?: string;
      } = {};
      const n = parseInt(setRequired, 10);
      if (!Number.isNaN(n)) body.stampsRequired = n;
      if (setReward.trim().length >= 2) body.rewardLabel = setReward.trim();
      if (setReview.trim().length > 0) body.reviewUrl = setReview.trim();
      if (setPhone.trim().length > 0) body.phone = setPhone.trim();
      if (setEmail.trim().length > 0) body.email = setEmail.trim();
      if (setInsta.trim().length > 0) body.instagram = setInsta.trim();
      if (setFb.trim().length > 0) body.facebook = setFb.trim();
      if (setSite.trim().length > 0) body.website = setSite.trim();
      if (tz) body.timezone = tz;
      // Sent even when empty — that is how the venue takes a finished notice
      // down. The other text fields deliberately skip empties instead.
      if (announceTouched) {
        body.announcement = setAnnounce.trim();
        body.announcementKind = annKind;
      }
      if (orderTouched) body.orderUrl = setOrder.trim();
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
        {/* The counter wears the café's brand too — the owner sees their own
            logo on their own screen, which is half of what "Branded" sells. */}
        {(() => {
          const b = venue?.branding ?? {};
          const logo = typeof b.logo === 'string' && b.logo.startsWith('data:image/') ? b.logo : null;
          const accent =
            typeof b.accent === 'string' && /^#[0-9A-Fa-f]{6}$/.test(b.accent) ? b.accent : null;
          return (
            <div className="text-center">
              {logo ? (
                <div className="flex items-center justify-center gap-3">
                  <img src={logo} alt="" className="h-10 max-w-[110px] object-contain" width={110} height={40} />
                  <h1 className="font-display text-2xl font-bold md:text-4xl">{venue?.name ?? '…'}</h1>
                </div>
              ) : (
                <>
                  <p
                    className="text-xs uppercase tracking-[0.3em] text-hero-gold"
                    style={accent ? { color: accent } : undefined}
                  >
                    Business
                  </p>
                  <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">{venue?.name ?? '…'}</h1>
                </>
              )}
              <p className="mt-1 text-sm text-slate-400">{t('b.sub')}</p>
            </div>
          );
        })()}

        {/* The counter is not one big card: it is a short stack of small
            ones on the page itself — numbers, the customer, the scanner —
            each a thing you can put a thumb on. Only the sign-in and the
            setup-code states sit in a single card. */}
        <div className={role === 'owner' || role === 'staff' ? 'mt-6' : 'card mt-8 p-6 md:p-8'}>
          {!ready ? null : !authenticated ? (
            <div className="text-center">
              <p className="mb-3 text-sm text-slate-400">
                {t('b.login.hint', { name: venue?.name ?? '…' })}
              </p>
              <button
                type="button"
                onClick={login}
                className="rounded-full bg-hero-gold px-6 py-2.5 font-semibold text-hero-deep transition hover:bg-hero-gold-bright"
              >
                {t('b.login.btn')}
              </button>
            </div>
          ) : role === null ? (
            // Role still resolving. Without this the counter flashes into view
            // for anyone, including someone who has no business at this venue.
            <p className="py-10 text-center text-sm text-slate-500">{t('pt.loading')}</p>
          ) : role === 'none' ? (
            <div className="text-center">
              <p className="mb-3 text-sm text-slate-400">
                {t('b.notmerchant', { name: venue?.name ?? '…' })}
              </p>
              <p className="mb-3 text-xs text-slate-500">
                {t('b.anycode.hint')}
              </p>
              {/* Stacked, input FIRST: side-by-side the input shrank to a
                 sliver on small phones and the keyboard covered it, so the
                 owner typed their setup code blind (PXP Donuts session).
                 Full-width and scrolled to centre on focus, every character
                 stays visible while it is typed. */}
              <div className="mx-auto mt-3 max-w-xs space-y-2">
                <input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={8}
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    const len = setupCode.trim().length;
                    if (e.key === 'Enter' && !claiming && (len === 8 || len === 6)) {
                      void handleCode();
                    }
                  }}
                  onFocus={(e) =>
                    e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })
                  }
                  placeholder={t('b.setupcode.ph')}
                  className="block w-full rounded-xl border-2 border-hero-gold/50 bg-hero-deep px-3 py-3 text-center font-mono text-2xl tracking-[0.3em] text-hero-gold placeholder:text-base placeholder:tracking-normal placeholder:text-slate-700 focus:border-hero-gold focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCode()}
                  disabled={
                    claiming ||
                    (setupCode.trim().length !== 8 && setupCode.trim().length !== 6)
                  }
                  className="block w-full rounded-full bg-hero-gold px-5 py-2.5 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-40"
                >
                  {/* One neutral label, whatever the length. The old label
                     flipped to "Join the team" at the 6th typed character of
                     an 8-character owner code, then flipped again — watching
                     it, the PXP Donuts owner briefly thought he was being
                     demoted. The server tells the two codes apart; the
                     button does not need to narrate it mid-keystroke. */}
                  {claiming ? t('b.claim.busy') : t('b.code.btn')}
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
              {/* Shift summary — three numbers a barista glances at during
                  service and an owner reads first thing in the morning. */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  {t('b.today')}
                </span>
                {/* A café that finds the tone annoying would otherwise mute the
                    whole phone and lose the haptics with it. */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    setMutedState(next);
                    if (!next) {
                      primeAudio();
                      playGrant();
                    }
                  }}
                  title={muted ? t('b.sound.on') : t('b.sound.off')}
                  className="rounded-full px-2 py-0.5 text-sm text-slate-500 transition hover:text-white"
                >
                  {muted ? '🔇' : '🔊'}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { v: today?.stamps ?? 0, l: t('b.today.stamps') },
                  { v: today?.rewards ?? 0, l: t('b.today.rewards') },
                  { v: today?.customers ?? 0, l: t('b.today.customers') },
                ].map((x) => (
                  <div key={x.l} className="card-sm px-2 py-3 text-center">
                    <p className="tnum font-display text-2xl font-bold leading-none text-white">{x.v}</p>
                    <p className="mt-1.5 text-[10px] uppercase tracking-wider text-slate-500">{x.l}</p>
                  </div>
                ))}
              </div>

              {/* Figurine check-ins — codes arrive by themselves, nobody types. */}
              {checkins.length > 0 && (
                <div className="card-sm mt-3 border-hero-cyan/30 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-hero-cyan">
                    📡 {t('b.checkin.title')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {checkins.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setCodeInput(c.code);
                          void lookupCustomer(c.code);
                        }}
                        className="chip font-mono tracking-[0.15em] text-hero-cyan hover:border-white/30 disabled:opacity-40"
                      >
                        {c.code}
                        <span className="font-sans text-[10px] tracking-normal text-slate-400">
                          {c.secondsAgo < 60 ? t('b.checkin.now') : `${Math.floor(c.secondsAgo / 60)}m`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {queued.length > 0 && (
                <div className="card-sm card-gold mt-3 flex items-center justify-between gap-2 px-4 py-2.5">
                  <p className="text-xs text-hero-gold">
                    ⏳ {t('b.queued.n', { n: queued.length })}
                  </p>
                  <button
                    type="button"
                    onClick={() => void drainQueue()}
                    className="btn btn-primary btn-sm"
                  >
                    {t('b.queued.retry')}
                  </button>
                </div>
              )}

              {/* Customer card — ABOVE the scanner once someone is found, so
                  the +1 is under the thumb that just scanned, not below the
                  fold. */}
              <AnimatePresence mode="wait">
                {customer && (
                  <motion.div
                    key={customer.code}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="card mt-3 p-5"
                  >
                    {customer.birthdayToday && (
                      <div className="mb-3 rounded-xl border border-hero-gold/50 bg-hero-gold/10 px-3 py-2 text-center text-sm text-hero-gold">
                        🎂 {t('b.birthday')}
                      </div>
                    )}

                    {/* Rewards this customer already paid for with BITS and
                        can collect here: one button each. The code they hold
                        is sent under the hood — nobody types it. */}
                    {(customer.rewards ?? []).length > 0 && (
                      <div className="mb-3 space-y-2">
                        {(customer.rewards ?? []).map((r) => (
                          <div
                            key={r.code}
                            className="card-sm card-gold flex items-center gap-3 px-3 py-2"
                          >
                            {r.imageUrl && (
                              <img src={r.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] uppercase tracking-wider text-hero-gold">
                                {t('b.rw.card')}
                              </p>
                              <p className="truncate text-sm font-semibold text-white">{r.itemName}</p>
                            </div>
                            <button
                              type="button"
                              disabled={rewardBusy}
                              onClick={() => void fulfilReward(r.code)}
                              className="btn btn-primary btn-sm shrink-0"
                            >
                              {rewardBusy ? '…' : t('b.rw.btn')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">{t('b.code.label')}</p>
                        <p className="mt-0.5 font-mono text-lg tracking-[0.25em] text-hero-cyan">
                          {customer.code}
                        </p>
                      </div>
                      <p className="tnum font-display text-4xl font-bold leading-none">
                        <span className={customer.canRedeem ? 'text-hero-gold' : 'text-white'}>
                          {customer.stamps}
                        </span>
                        <span className="text-xl text-slate-500">/{customer.required}</span>
                      </p>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hero-navy2">
                      <div
                        className="h-full rounded-full bg-hero-gold transition-[width]"
                        style={{ width: `${Math.min(100, (customer.stamps / Math.max(1, customer.required)) * 100)}%` }}
                      />
                    </div>

                    <div className="mt-5">
                      <p className="mb-2 text-xs text-slate-500">{t('b.coffees')}</p>
                      {/* Symmetric on purpose: -2 -1 +1 +2 reads as one scale
                          the eye can scan, where -1 +1 +2 +3 reads as three
                          buttons and an odd one out. Dumitru's note from the
                          counter, and he is right. */}
                      <div className="grid grid-cols-4 gap-2">
                        {[-2, -1, 1, 2].map((n) => (
                          <button
                            key={n}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              primeAudio();
                              if (n < 0) void revokeOne(-n);
                              else void grant(n);
                            }}
                            title={
                              n < 0
                                ? 'Correction: removes the most recent stamps from today'
                                : undefined
                            }
                            className={`tnum rounded-2xl border py-4 font-display text-xl font-bold transition disabled:opacity-40 ${
                              n < 0
                                ? 'border-white/10 text-slate-400 hover:border-red-400/60 hover:text-red-300'
                                : 'border-transparent bg-hero-gold text-hero-deep hover:bg-hero-gold-bright'
                            }`}
                          >
                            {n > 0 ? `+${n}` : `−${-n}`}
                          </button>
                        ))}
                      </div>
                      {/* Three coffees at once still happens; +2 then +1 is two
                          taps, and a fourth column would break the symmetry. */}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          primeAudio();
                          void grant(3);
                        }}
                        className="btn btn-ghost btn-sm mt-2 w-full"
                      >
                        +3
                      </button>
                      <p className="mt-1.5 text-[10px] text-slate-600">{t('b.minus.note')}</p>
                    </div>

                    {customer.canRedeem && (
                      <div className="card-sm card-gold mt-4 p-3">
                        <p className="text-xs font-semibold text-hero-gold">{t('b.cardfull')}</p>
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
                            onKeyDown={(e) => {
                              // Enter finishes the reward, same as the button.
                              // A barista at a busy counter types the code and
                              // hits Enter; reaching for a button is a pause
                              // the queue notices.
                              if (e.key === 'Enter' && !busy && CODE_RE.test(redeemInput)) {
                                void redeem();
                              }
                            }}
                            placeholder="REWARD"
                            className="min-w-0 flex-1 rounded-lg border border-hero-gold/40 bg-hero-deep px-3 py-2 text-center font-mono text-lg tracking-[0.2em] text-hero-gold placeholder:text-slate-700 focus:border-hero-gold focus:outline-none sm:text-xl sm:tracking-[0.25em]"
                          />
                          <button
                            type="button"
                            disabled={busy || !CODE_RE.test(redeemInput)}
                            onClick={() => void redeem()}
                            className="btn btn-primary btn-sm shrink-0"
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
                  className={`mt-3 rounded-2xl border p-3 text-center text-sm ${
                    notice.kind === 'ok'
                      ? 'border-solana-green/30 bg-solana-green/10 text-solana-green'
                      : 'border-red-500/30 bg-red-500/10 text-red-200'
                  }`}
                >
                  {notice.text}
                </p>
              )}

              {/* THE action. One big button: scan the customer's QR. Typing
                  the code is the fallback underneath, never the headline. */}
              <div className="card mt-3 p-4">
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  className="btn btn-primary w-full py-4 text-base"
                >
                  {t('b.scan.btn')}
                </button>
                <label htmlFor="code" className="mt-4 block text-center text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {t('b.code.or')}
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
                    className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-hero-deep px-3 py-3 text-center font-mono text-xl tracking-[0.25em] text-white placeholder:text-slate-700 focus:border-hero-cyan focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!codeValid || busy}
                    onClick={() => void lookupCustomer(normalizedCode)}
                    className="btn btn-secondary shrink-0 rounded-2xl"
                  >
                    {t('b.find')}
                  </button>
                </div>
              </div>

              {/* BITS reward hand-over BY CODE — the fallback for a customer
                  who shows the code without being looked up first. Its own
                  input, so it is never confused with the two other 6-character
                  codes on this screen. Folded away: the normal path is the
                  gold button on the customer card. */}
              <details className="card-sm mt-3">
                <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-slate-300">
                  {t('b.rw.title')}
                </summary>
                <div className="border-t border-white/[0.08] px-4 py-3">
                  <p className="text-[11px] leading-relaxed text-slate-400">{t('b.rw.hint')}</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      maxLength={6}
                      value={rewardCode}
                      onChange={(e) => setRewardCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && CODE_RE.test(rewardCode)) void fulfilReward();
                      }}
                      placeholder={t('b.rw.ph')}
                      className="w-full rounded-2xl border border-white/15 bg-hero-deep px-3 py-2 text-center font-mono text-lg tracking-[0.2em] text-white focus:border-hero-gold focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={rewardBusy || !CODE_RE.test(rewardCode)}
                      onClick={() => void fulfilReward()}
                      className="btn btn-primary btn-sm shrink-0"
                    >
                      {rewardBusy ? '…' : t('b.rw.btn')}
                    </button>
                  </div>
                </div>
              </details>

              {/* Folders are the owner's. Staff get the counter and their
                  shift summary; the history is partly a record OF them. */}
              {role === 'staff' && (
                <p className="mt-6 px-4 text-center text-xs text-slate-500">
                  {t('b.staffmode', { name: staffName ?? '' })}
                </p>
              )}
              {role === 'owner' && (
              <FolderTabs
                active={folderTab}
                onOpen={(k) => {
                  setFolderTab(k);
                  // Stats are a network call; fetch them the first time the
                  // folder is actually opened rather than on page load.
                  if (k === 'stats' && !analytics) void toggleStats();
                }}
                tabs={[
                  {
                    key: 'team',
                    icon: '👥',
                    label: t('b.tab.team'),
                    render: () => (
                      <VenueStaff
                        slug={slug}
                        onInspect={(name) => {
                          setInspectStaff(name);
                          setFolderTab('history');
                        }}
                      />
                    ),
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
                            className="rounded-xl border border-white/[0.08] bg-hero-navy p-3 text-center"
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
                        <div className="mt-4 rounded-xl border border-white/[0.08] bg-hero-navy p-3">
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
                            className="rounded-xl border border-white/[0.08] bg-hero-navy p-2"
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
                    render: () => (
                      <VenueHistory slug={slug} embedded byStaff={inspectStaff} />
                    ),
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
                            className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
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
                            className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
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
                            className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
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
                            className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                          />
                        </label>
                      </div>

                      {/* "Order ahead": a link to whatever they already use.
                          Renders as a button on the customer's card. */}
                      <label className="mt-3 block text-xs text-slate-500">
                        {t('b.set.order')}
                        <input
                          type="url"
                          maxLength={300}
                          value={setOrder}
                          onChange={(e) => {
                            setSetOrder(e.target.value);
                            setOrderTouched(true);
                          }}
                          placeholder="https://…"
                          className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                        />
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-600">
                          {t('b.set.order.hint')}
                        </span>
                      </label>

                      {/* "What's on this week" — the one thing here that
                          changes weekly rather than once at setup, so it gets
                          its own full-width row and a visible character
                          budget. */}
                      <label className="mt-3 block text-xs text-slate-500">
                        {t('b.set.announce')}
                        <input
                          type="text"
                          maxLength={160}
                          value={setAnnounce}
                          onChange={(e) => {
                            setSetAnnounce(e.target.value);
                            setAnnounceTouched(true);
                          }}
                          placeholder={t('b.set.announce.ph')}
                          className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                        />
                        {/* Kind → the chip's colour on the customer's card. */}
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {(['news', 'offer', 'event'] as const).map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => {
                                setAnnKind(k);
                                setAnnounceTouched(true);
                              }}
                              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                                annKind === k
                                  ? k === 'offer'
                                    ? 'border-hero-gold bg-hero-gold/15 text-hero-gold'
                                    : k === 'event'
                                    ? 'border-hero-cyan bg-hero-cyan/15 text-hero-cyan'
                                    : 'border-slate-300 bg-slate-300/10 text-slate-200'
                                  : 'border-white/15 text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {t(`b.set.announce.k.${k}` as 'b.set.announce.k.news')}
                            </button>
                          ))}
                        </span>
                        <span className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[11px] leading-relaxed text-slate-600">
                            {t('b.set.announce.hint')}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-slate-600">
                            {setAnnounce.length}/160
                          </span>
                        </span>
                      </label>

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
                                      : 'border-white/15 text-slate-400 hover:border-hero-gold/50'
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
                              className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-2 py-1.5 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
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
                              className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-2 py-1.5 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
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
                              className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-2 py-1.5 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
                            >
                              <option value={2}>x2</option>
                              <option value={3}>x3</option>
                            </select>
                          </label>
                        </div>
                        <p className="mt-1.5 text-[10px] text-slate-600">{t('b.set.hh.hint')}</p>
                      </div>

                      {/* Contact, shown to customers on their card page. A
                          loyalty page people already open is the cheapest place
                          a café has to be findable. */}
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <label className="text-xs text-slate-500">
                          {t('b.set.email')}
                          <input
                            value={setEmail}
                            onChange={(e) => setSetEmail(e.target.value)}
                            placeholder="contact@cafenea.ro"
                            className="mt-1 w-full rounded-xl border border-white/[0.08] bg-hero-navy px-3 py-2 text-sm text-white placeholder:text-slate-600"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          {t('b.set.insta')}
                          <input
                            value={setInsta}
                            onChange={(e) => setSetInsta(e.target.value)}
                            placeholder="@cafeneaua_mea"
                            className="mt-1 w-full rounded-xl border border-white/[0.08] bg-hero-navy px-3 py-2 text-sm text-white placeholder:text-slate-600"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          {t('b.set.fb')}
                          <input
                            value={setFb}
                            onChange={(e) => setSetFb(e.target.value)}
                            placeholder="cafeneaua.mea"
                            className="mt-1 w-full rounded-xl border border-white/[0.08] bg-hero-navy px-3 py-2 text-sm text-white placeholder:text-slate-600"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          {t('b.set.site')}
                          <input
                            value={setSite}
                            onChange={(e) => setSetSite(e.target.value)}
                            placeholder="https://cafenea.ro"
                            className="mt-1 w-full rounded-xl border border-white/[0.08] bg-hero-navy px-3 py-2 text-sm text-white placeholder:text-slate-600"
                          />
                        </label>
                      </div>

                      {/* Happy Hour is read in this zone. Without it the
                          window is evaluated in Romania for everyone, which is
                          a confident wrong answer rather than a missing one. */}
                      <label className="mt-4 block text-xs text-slate-500">
                        {t('b.set.tz')}
                        <select
                          value={tz || Intl.DateTimeFormat().resolvedOptions().timeZone}
                          onChange={(e) => setTz(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-white/[0.08] bg-hero-navy px-3 py-2 text-sm text-white"
                        >
                          {Array.from(
                            new Set([
                              Intl.DateTimeFormat().resolvedOptions().timeZone,
                              'Europe/Bucharest',
                              'Europe/London',
                              'Europe/Madrid',
                              'Europe/Berlin',
                              'America/Toronto',
                              'America/Edmonton',
                              'America/New_York',
                              'America/Los_Angeles',
                              'Asia/Dubai',
                            ])
                          ).map((z) => (
                            <option key={z} value={z}>
                              {z.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[10px] text-slate-600">
                          {t('b.set.tz.hint')}
                        </span>
                      </label>

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
