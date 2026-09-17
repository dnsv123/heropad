import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '../lib/auth';
import { useSolanaWallets } from '../lib/auth';

import PowerMeter from '../components/PowerMeter';
import StampsCard from '../components/StampsCard';
import VenueContact, { type HappyHourNext } from '../components/VenueContact';
import ConsentPrompt from '../components/ConsentPrompt';
import MyCards from '../components/MyCards';
import { getJson, postJson } from '../services/apiClient';
import { getItem, setItem, removeItem } from '../services/storageService';
import { hapticTap } from '../services/platformService';
import { useT } from '../i18n';

// Loyalty page — customer view, wired to the REAL backend.
// ---------------------------------------------------------------------------
// Production model: the customer never grants their own stamps. This page only
// (1) shows the personal code the barista types/scans at the counter, and
// (2) polls progress so a freshly granted stamp appears live with the charge
// animation. Grants and redeems happen on /business (merchant device).

const POLL_MS = 4000;

/** How long a venue's "what's on this week" notice stays visible. */
const ANNOUNCEMENT_TTL_DAYS = 14;

interface VenueInfo {
  slug: string;
  name: string;
  stampsRequired: number;
  branding: Record<string, unknown>;
  gpsLat?: number | null;
  gpsLng?: number | null;
  happyHour?: { active: boolean; mult: number } | null;
  happyHourNext?: HappyHourNext | null;
}

interface MeResponse {
  ok: true;
  code: string;
  venue: { slug: string; name: string };
  stamps: number;
  required: number;
  totalStamps: number;
  cardsCompleted: number;
  canRedeem: boolean;
}

interface RedeemCodeState {
  code: string;
  expiresAt: string;
}

/**
 * Defense in depth for merchant-controlled links: the API validates on write,
 * but `venues.branding` also has non-API writers (seeds, manual Supabase
 * edits). React only WARNS on a `javascript:` href — it still renders it — so
 * we re-check the scheme here before turning anything into a clickable link.
 */
function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Venue slug from the URL, constrained to the shape the API accepts. */
function safeSlug(value: string): string {
  return /^[a-z0-9-]{2,60}$/.test(value) ? value : 'cafe-victor';
}

const REF_RE = /^[A-Z2-9]{6}$/i;

export default function Loyalty() {
  const { slug: rawSlug = 'cafe-victor' } = useParams();
  const slug = safeSlug(rawSlug);
  const [searchParams] = useSearchParams();
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady, createWallet } = useSolanaWallets();
  const { t } = useT();

  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [justCharged, setJustCharged] = useState(false);
  /** 0-based index of a stamp that just landed — drives the badge flight. */
  const [newStamp, setNewStamp] = useState<number | null>(null);
  const flightDone = useCallback(() => setNewStamp(null), []);
  const [celebrating, setCelebrating] = useState(false);
  const [redeemCode, setRedeemCode] = useState<RedeemCodeState | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemSecondsLeft, setRedeemSecondsLeft] = useState(0);
  // QR of the personal code, so the counter can scan instead of typing.
  const [codeQr, setCodeQr] = useState<string | null>(null);
  const [redeemQr, setRedeemQr] = useState<string | null>(null);

  // Previous values so polling can detect "something changed" and animate.
  const prevStamps = useRef<number | null>(null);
  const prevCards = useRef<number | null>(null);

  // Self-heal: some browsers (notably incognito/private mode, which blocks
  // third-party storage) prevent Privy from provisioning the embedded wallet
  // at login. Without a wallet the trophy can't be minted, so we retry the
  // creation once here. If it still fails, a hint below tells the user why.
  const triedCreateWallet = useRef(false);
  useEffect(() => {
    if (!ready || !authenticated || !walletsReady) return;
    if (wallets.length === 0 && !triedCreateWallet.current) {
      triedCreateWallet.current = true;
      void createWallet().catch(() => {
        /* blocked (private mode) — the hint below explains it */
      });
    }
  }, [ready, authenticated, walletsReady, wallets.length, createWallet]);
  const walletMissing = ready && authenticated && walletsReady && wallets.length === 0;

  // --- "What's on this week" --------------------------------------------------
  // A notice the venue wrote for its regulars, with a two-week shelf life.
  // The expiry is the feature: a busy owner posts "live music Thursday" and
  // then forgets it exists, and a card still advertising a concert from last
  // month is worse for them than no notice at all. Computed from the
  // server-stamped write time, so a stale one cannot be revived client-side.
  const freshAnnouncement = useMemo(() => {
    const b = venue?.branding ?? {};
    const text = typeof b.announcement === 'string' ? b.announcement.trim() : '';
    const at = typeof b.announcementAt === 'string' ? Date.parse(b.announcementAt) : NaN;
    if (!text || Number.isNaN(at)) return null;
    const ageDays = (Date.now() - at) / 86_400_000;
    return ageDays >= 0 && ageDays <= ANNOUNCEMENT_TTL_DAYS ? text : null;
  }, [venue?.branding]);

  // --- Referral ("Adu un prieten") -------------------------------------------
  // A friend arriving via ?ref=CODE may still have to log in first, so the
  // code is parked in storage and submitted once, after auth. The server
  // decides whether it counts (brand-new account only, never self).
  const [refShareState, setRefShareState] = useState<'idle' | 'copied'>('idle');
  const refSubmitted = useRef(false);

  useEffect(() => {
    const ref = (searchParams.get('ref') ?? '').toUpperCase();
    if (REF_RE.test(ref)) void setItem('pendingRef', ref);
  }, [searchParams]);

  // --- NFC figurine check-in (?tap=1) ----------------------------------------
  // The tap opened this page; once the customer is logged in, the phone
  // announces them at the counter so the barista sees their code without
  // anyone typing it. One announcement per page open.
  const [tappedIn, setTappedIn] = useState(false);
  const tapSubmitted = useRef(false);
  useEffect(() => {
    if (searchParams.get('tap') !== '1') return;
    if (!ready || !authenticated || tapSubmitted.current) return;
    tapSubmitted.current = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        await postJson<Record<string, never>, { ok: true }>(
          `/api/loyalty/me/${slug}/checkin`,
          {},
          token
        );
        setTappedIn(true);
        hapticTap(20);
      } catch {
        tapSubmitted.current = false; // network hiccup — next render retries
      }
    })();
  }, [searchParams, ready, authenticated, slug, getAccessToken]);

  useEffect(() => {
    if (!ready || !authenticated || refSubmitted.current) return;
    refSubmitted.current = true;
    void (async () => {
      try {
        const pending = await getItem<string>('pendingRef');
        if (!pending || !REF_RE.test(pending)) return;
        const token = await getAccessToken();
        if (!token) return;
        await postJson<{ code: string }, { ok: true }>(
          '/api/loyalty/me/referral',
          { code: pending },
          token
        );
        // One shot either way: linked or legitimately refused (existing
        // customer, own code) — resubmitting would never change the answer.
        await removeItem('pendingRef');
      } catch {
        // Network hiccup: keep the pending code; the next page open retries.
        refSubmitted.current = false;
      }
    })();
  }, [ready, authenticated, getAccessToken]);

  async function shareInvite() {
    if (!me?.code) return;
    const url = `${window.location.origin}/loyalty/${slug}?ref=${me.code}`;
    const text = t('ref.share.text', { venue: venue?.name ?? 'HeroPad' });
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        /* dismissed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard?.writeText(`${text} ${url}`);
      setRefShareState('copied');
      window.setTimeout(() => setRefShareState('idle'), 2000);
    } catch {
      /* clipboard blocked — nothing sensible left to do */
    }
  }

  // Public venue card — works logged-out, so the page always shows the café.
  useEffect(() => {
    let active = true;
    getJson<{ ok: true; venue: VenueInfo }>(`/api/loyalty/venue/${slug}`)
      .then((r) => {
        if (active) {
          setVenue(r.venue);
          setVenueError(null);
          // The bottom nav's "Card" brings the customer back HERE, not to a
          // default café they have never been to.
          try {
            localStorage.setItem('hp.lastVenue', r.venue.slug);
          } catch {
            /* private mode — the nav falls back to /loyalty */
          }
        }
      })
      .catch((err: Error) => {
        if (active) setVenueError(err.message);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  // Authenticated progress — polled. The server is the single source of truth.
  // We pass the Solana wallet so the backend links it to the identity — that's
  // what makes the trophy cNFT mintable straight into this user's wallet.
  const walletAddress = wallets[0]?.address ?? null;
  const fetchMe = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const qs = walletAddress ? `?wallet=${encodeURIComponent(walletAddress)}` : '';
      const r = await getJson<MeResponse>(`/api/loyalty/me/${slug}${qs}`, token);
      setMeError(null);

      // Detect changes for feedback BEFORE committing new state.
      if (prevStamps.current !== null && r.stamps > prevStamps.current) {
        setJustCharged(true);
        hapticTap(20);
        window.setTimeout(() => setJustCharged(false), 500);
        // The freshest stamp flies into its circle (only while it fits the
        // current card — a redeemed/rolled-over card animates nothing).
        if (r.stamps <= r.required) setNewStamp(r.stamps - 1);
      }
      if (prevCards.current !== null && r.cardsCompleted > prevCards.current) {
        setCelebrating(true);
        setRedeemCode(null); // the card was redeemed — the one-time code is spent
        hapticTap(40);
        // No auto-dismiss: the customer closes it when they are done reading.
      }
      prevStamps.current = r.stamps;
      prevCards.current = r.cardsCompleted;
      setMe(r);
    } catch (err) {
      setMeError((err as Error).message);
    }
  }, [slug, getAccessToken, walletAddress]);

  // Render the codes as QR locally (never sent to a third-party generator).
  // Prefix disambiguates the two kinds when the counter scans them.
  useEffect(() => {
    if (!me?.code) {
      setCodeQr(null);
      return;
    }
    void QRCode.toDataURL(`HPC:${me.code}`, {
      width: 320,
      margin: 1,
      color: { dark: '#0A1B3A', light: '#FFFFFF' },
    }).then(setCodeQr, () => setCodeQr(null));
  }, [me?.code]);

  useEffect(() => {
    if (!redeemCode?.code) {
      setRedeemQr(null);
      return;
    }
    void QRCode.toDataURL(`HPR:${redeemCode.code}`, {
      width: 320,
      margin: 1,
      color: { dark: '#0A1B3A', light: '#FFFFFF' },
    }).then(setRedeemQr, () => setRedeemQr(null));
  }, [redeemCode?.code]);

  // Escape closes the celebration, and the page underneath must not scroll
  // while it is up — the same manners the collectible modal already has.
  useEffect(() => {
    if (!celebrating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCelebrating(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [celebrating]);

  // Countdown for the active one-time redeem code (5-minute TTL).
  useEffect(() => {
    if (!redeemCode) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.floor((new Date(redeemCode.expiresAt).getTime() - Date.now()) / 1000)
      );
      setRedeemSecondsLeft(left);
      if (left <= 0) setRedeemCode(null);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [redeemCode]);

  async function requestRedeemCode() {
    setRedeemBusy(true);
    try {
      const token = await getAccessToken();
      const r = await postJson<Record<string, never>, { ok: true } & RedeemCodeState>(
        `/api/loyalty/me/${slug}/redeem-code`,
        {},
        token ?? undefined
      );
      hapticTap(20);
      setRedeemCode({ code: r.code, expiresAt: r.expiresAt });
    } catch (err) {
      setMeError((err as Error).message);
    } finally {
      setRedeemBusy(false);
    }
  }

  useEffect(() => {
    if (!ready || !authenticated) return;
    void fetchMe();
    // Poll only while the page is actually being looked at. A card left open
    // in a pocket would otherwise fire ~900 requests an hour, each waking the
    // cellular radio. Returning to the page refetches immediately, so the
    // live-stamp feel is unchanged.
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchMe();
    }, POLL_MS);
    const onFocus = () => void fetchMe();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchMe();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, authenticated, fetchMe]);

  // No fallback threshold. There used to be a `?? 10` here, and for the two
  // seconds before the venue loaded, a customer who had just scanned the QR
  // at a 5-stamp café was told they needed 10 — then watched the number
  // change. The first three seconds of the relationship are not the place for
  // a number we are guessing. Until we know, we show a skeleton.
  const required = me?.required ?? venue?.stampsRequired ?? null;
  const stamps = me?.stamps ?? 0;
  /** The venue's reward, e.g. "A free donut" — the entire point of the card. */
  const rewardLabel =
    typeof venue?.branding?.reward === 'string' && venue.branding.reward.trim()
      ? venue.branding.reward.trim()
      : null;

  // Co-branding (Branded and up). One logo, one colour. The colour touches
  // only the eyebrow, the reward chip and the card's glow — never the
  // background — so a café with a dark or garish brand still gets a card
  // that reads. Unset → the default gold/cyan, i.e. pure SuperVictor.
  const brandLogo =
    typeof venue?.branding?.logo === 'string' && venue.branding.logo.startsWith('data:image/')
      ? venue.branding.logo
      : null;
  const brandAccent =
    typeof venue?.branding?.accent === 'string' && /^#[0-9A-Fa-f]{6}$/.test(venue.branding.accent)
      ? venue.branding.accent
      : null;

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />

      <div className="mx-auto max-w-xl px-6 py-10 md:py-16">
        {/* Venue header */}
        <div className="text-center">
          {/* Branded venue: ONE row — logo beside the name — and their own
              line underneath. The "⚡ Power Pass" eyebrow steps aside; the
              logo is the eyebrow now. Three stacked lines (eyebrow, logo,
              name) ate a third of a phone screen for no extra meaning. */}
          {brandLogo ? (
            <div className="flex items-center justify-center gap-3">
              <img
                src={brandLogo}
                alt=""
                className="h-10 max-w-[110px] object-contain"
                width={110}
                height={40}
              />
              <h1 className="font-display text-2xl font-bold md:text-4xl">{venue?.name ?? '…'}</h1>
            </div>
          ) : (
            <>
              <p
                className="text-xs uppercase tracking-[0.3em] text-hero-cyan"
                style={brandAccent ? { color: brandAccent } : undefined}
              >
                {t('loy.eyebrow')}
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
                {venue?.name ?? '…'}
              </h1>
            </>
          )}
          {typeof venue?.branding?.tagline === 'string' && venue.branding.tagline.trim() && (
            <p className="mt-1 text-sm text-slate-400">{venue.branding.tagline.trim()}</p>
          )}
          {venueError && (
            <p className="mt-2 text-sm text-red-300">{venueError}</p>
          )}

        </div>

        {/* A regular at several cafés switches here, not through the menu. */}
        <MyCards currentSlug={slug} />

        {/* Figurine tap acknowledged — the customer knows the counter saw them. */}
        {tappedIn && (
          <div className="mt-4 rounded-xl border border-solana-green/40 bg-solana-green/10 p-3 text-center text-sm text-solana-green">
            ✋ {t('loy.tap.done')}
          </div>
        )}

        {/* Happy Hour — gold pulsing banner while the window is live. The
            countdown lives inside VenueContact below, where it can also say
            when the NEXT one starts. */}
        {venue?.happyHour?.active && (
          <div className="mt-4 animate-pulse rounded-xl border-2 border-hero-gold bg-hero-gold/15 p-3 text-center text-sm font-bold text-hero-gold">
            {t('loy.hh.active', { m: venue.happyHour.mult })}
          </div>
        )}

        {/* "What's on this week" — the venue's own line to its regulars.
            Hidden once it goes stale so a card can never advertise last
            month's concert; the venue clears it early by emptying the field. */}
        {freshAnnouncement && (() => {
          // The chip says what kind of line it is before the customer reads
          // it: gold = there is something to gain today, cyan = something
          // is happening, plain = the venue is just talking to its regulars.
          const kind = venue?.branding?.announcementKind;
          const tone =
            kind === 'offer'
              ? { box: 'border-hero-gold/40 bg-hero-gold/10', chip: 'bg-hero-gold text-hero-deep', key: 'loy.announce.offer' as const }
              : kind === 'event'
              ? { box: 'border-hero-cyan/40 bg-hero-cyan/10', chip: 'bg-hero-cyan text-hero-deep', key: 'loy.announce.event' as const }
              : { box: 'border-white/10 bg-hero-navy', chip: 'bg-slate-200 text-hero-deep', key: 'loy.announce.news' as const };
          return (
            <div className={`mt-4 rounded-xl border p-3 ${tone.box}`}>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.chip}`}>
                  {t(tone.key)}
                </span>
                <span className="text-[11px] text-slate-500">{venue?.name ?? ''}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-100">{freshAnnouncement}</p>
            </div>
          );
        })()}

        {/* Celebration — a CENTRED modal, not a block in the page.
           It used to render inline below the venue card and auto-dismiss after
           8 seconds: by the time the customer looked back from the barista, the
           moment (and the review invite with it) was gone, and reaching it
           meant scrolling up. Now it takes the middle of the screen and stays
           until the customer closes it — this is the happiest moment in the
           whole flow and the one place a review actually gets asked for. */}
        <AnimatePresence>
          {celebrating && (
            <motion.div
              key="celebrate-bg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCelebrating(false)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="celebrate-title"
                initial={{ opacity: 0, scale: 0.9, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                onClick={(e) => e.stopPropagation()}
                className="card relative w-full max-w-sm border-hero-gold/60 p-6 text-center"
              >
                <button
                  type="button"
                  aria-label={t('loy.celebrate.close')}
                  onClick={() => setCelebrating(false)}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-slate-400 transition hover:border-white/30 hover:text-white"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>

                <div className="text-5xl leading-none">🎉</div>
                <p
                  id="celebrate-title"
                  className="mt-3 font-display text-2xl font-bold text-solana-green"
                >
                  {t('loy.celebrate.title')}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {t('loy.celebrate.body')}{' '}
                  <a href="/profile" className="text-hero-cyan underline">
                    {t('loy.celebrate.link')}
                  </a>
                  {t('loy.celebrate.tail')}
                </p>

                {/* Review invite — shown to EVERYONE at the happiest moment (free
                    reward in hand). No filtering: Google forbids review-gating. */}
                {safeHttpsUrl(venue?.branding?.reviewUrl) && (
                  <a
                    href={safeHttpsUrl(venue?.branding?.reviewUrl) as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setCelebrating(false)}
                    className="mt-5 block w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-hero-deep shadow transition hover:bg-hero-gold-bright"
                  >
                    {t('loy.review.btn')}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setCelebrating(false)}
                  className="mt-3 text-xs text-slate-500 transition hover:text-slate-300"
                >
                  {t('loy.celebrate.close')}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="card mt-8 p-6 md:p-8"
          style={brandAccent ? { borderColor: `${brandAccent}66` } : undefined}
        >
          {required === null ? (
            // Skeleton, not a guess. Same height as the meter so nothing jumps.
            <div className="flex flex-col items-center gap-4 py-6" aria-busy="true">
              <div className="h-28 w-28 animate-pulse rounded-full bg-hero-navy2" />
              <div className="h-4 w-40 animate-pulse rounded-full bg-hero-navy2" />
            </div>
          ) : (
            <PowerMeter
              current={Math.min(stamps, required)}
              required={required}
              justCharged={justCharged}
            />
          )}

          {/* THE REWARD. A progress bar without a destination is just a bar —
              "2 more stamps" only motivates when you can see what is at the
              end of it. This is the venue's own promise, in its own words. */}
          {rewardLabel && required !== null && (
            <div
              className="mt-4 rounded-xl border border-hero-gold/35 bg-hero-gold/10 px-4 py-3 text-center"
              style={
                brandAccent
                  ? { borderColor: `${brandAccent}59`, background: `${brandAccent}1A` }
                  : undefined
              }
            >
              <p
                className="text-[11px] uppercase tracking-wider text-hero-gold/80"
                style={brandAccent ? { color: `${brandAccent}CC` } : undefined}
              >
                {t('loy.reward.label', { n: required })}
              </p>
              <p
                className="mt-0.5 font-display text-lg font-semibold text-hero-gold"
                style={brandAccent ? { color: brandAccent } : undefined}
              >
                {rewardLabel}
              </p>
            </div>
          )}

          {/* The cardboard-card feel, with our hero in it. */}
          {me && required !== null && (
            <StampsCard
              stamps={stamps}
              required={required}
              canRedeem={Boolean(me.canRedeem)}
              newStamp={newStamp}
              onFlightDone={flightDone}
            />
          )}

          {/* Full card → the customer generates a ONE-TIME redeem code on their
              own phone (proof of presence); the barista types that to redeem. */}
          {me?.canRedeem && !redeemCode && (
            <div className="mt-5 rounded-xl border border-hero-gold/40 bg-hero-gold/10 p-4 text-center">
              <p className="text-sm text-hero-gold">{t('loy.full.title')}</p>
              <button
                type="button"
                disabled={redeemBusy}
                onClick={() => void requestRedeemCode()}
                className="btn btn-primary mt-3"
              >
                {redeemBusy ? t('loy.full.generating') : t('loy.full.btn')}
              </button>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">{t('loy.full.note')}</p>
            </div>
          )}

          {me?.canRedeem && redeemCode && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-5 rounded-xl border border-hero-gold/60 bg-hero-gold/10 p-4 text-center"
            >
              <p className="text-xs uppercase tracking-wider text-hero-gold">
                {t('loy.code.label')}
              </p>
              {redeemQr && (
                <img
                  src={redeemQr}
                  alt=""
                  className="mx-auto mt-3 h-40 w-40 rounded-xl bg-white p-1.5 shadow-lg"
                />
              )}
              <p className="mt-2 font-mono text-4xl font-bold tracking-[0.35em] text-hero-gold">
                {redeemCode.code}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {t('loy.code.expires')}{' '}
                <span
                  className={
                    redeemSecondsLeft <= 60 ? 'font-semibold text-red-300' : 'text-slate-300'
                  }
                >
                  {Math.floor(redeemSecondsLeft / 60)}:
                  {String(redeemSecondsLeft % 60).padStart(2, '0')}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">{t('loy.code.show')}</p>
            </motion.div>
          )}

          <div className="mt-6 border-t border-white/[0.08] pt-6">
            {!ready ? null : !authenticated ? (
              <div className="text-center">
                <p className="mb-3 text-xs text-slate-500">{t('loy.login.hint')}</p>
                <button
                  type="button"
                  onClick={login}
                  className="btn btn-primary"
                >
                  {t('loy.login.btn')}
                </button>
              </div>
            ) : me ? (
              <div className="text-center">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  {t('loy.yourcode')}
                </p>
                {codeQr && (
                  <img
                    src={codeQr}
                    alt=""
                    className="mx-auto mt-3 h-40 w-40 rounded-xl bg-white p-1.5 shadow-lg"
                  />
                )}
                <motion.p
                  key={me.code}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mt-2 font-mono text-4xl font-bold tracking-[0.35em] text-hero-cyan"
                >
                  {me.code}
                </motion.p>
                <p className="mt-3 text-xs text-slate-500">
                  {t('loy.stats', {
                    total: me.totalStamps,
                    cards: me.cardsCompleted,
                    cardsWord:
                      me.cardsCompleted === 1 ? t('loy.card.one') : t('loy.card.many'),
                  })}
                </p>
                {walletMissing && (
                  <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[11px] leading-relaxed text-amber-200">
                    {t('loy.wallet.missing')}
                  </p>
                )}
              </div>
            ) : meError ? (
              <p className="text-center text-sm text-red-300">{meError}</p>
            ) : (
              <p className="text-center text-sm text-slate-500">{t('loy.loading')}</p>
            )}
          </div>
        </div>

        {/* Bring a friend — the invite link carries the personal code. The
            bonus lands on the friend's FIRST stamp, so only a real visit,
            confirmed at a counter, ever pays out. */}
        {me && (
          <div className="card-sm mt-6 p-5 text-center">
            <p className="font-display font-semibold text-white">
              🤝 {t('ref.title')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{t('ref.body')}</p>
            <button
              type="button"
              onClick={() => void shareInvite()}
              className="btn btn-secondary btn-sm mt-3"
            >
              {refShareState === 'copied' ? t('ref.copied') : t('ref.btn')}
            </button>
            <p className="mt-2 text-[11px] text-slate-600">{t('ref.hint')}</p>
          </div>
        )}

        {/* The venue's own details — BELOW the card, deliberately.
            This used to sit between the venue name and the stamps, which
            meant the first thing a customer saw after scanning at the counter
            was a countdown to tomorrow's Happy Hour and a "get directions"
            button for the room they were standing in. The card they came for
            was fifth on the screen. A loyalty page is also a small storefront
            for the café — but the storefront comes after the card. */}
        <VenueContact
          name={venue?.name ?? ''}
          branding={(venue?.branding ?? null)}
          gpsLat={venue?.gpsLat}
          gpsLng={venue?.gpsLng}
          happyHourNext={venue?.happyHourNext ?? null}
        />

        {/* BITS need a shop, or they are just a number. One line, one link. */}
        <Link
          to="/rewards"
          className="btn btn-secondary mt-4 w-full"
        >
          {t('loy.bits.shop')}
        </Link>

        {/* Asked once, only after the customer has stamps worth coming back for. */}
        <ConsentPrompt show={Boolean(me && me.totalStamps >= 2)} />

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
          {t('loy.footnote')}
        </p>
      </div>
    </section>
  );
}
