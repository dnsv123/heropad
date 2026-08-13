import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';

import PowerMeter from '../components/PowerMeter';
import VenueContact, { type HappyHourNext } from '../components/VenueContact';
import ConsentPrompt from '../components/ConsentPrompt';
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

  useEffect(() => {
    if (!ready || !authenticated || refSubmitted.current) return;
    refSubmitted.current = true;
    void (async () => {
      try {
        const pending = await getItem<string>('pendingRef');
        if (!pending || !REF_RE.test(pending)) return;
        const token = await getAccessToken();
        if (!token) return;
        await postJson<{ code: string }, { ok: true; linked: boolean }>(
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
      }
      if (prevCards.current !== null && r.cardsCompleted > prevCards.current) {
        setCelebrating(true);
        setRedeemCode(null); // the card was redeemed — the one-time code is spent
        hapticTap(40);
        window.setTimeout(() => setCelebrating(false), 8000);
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

  const required = me?.required ?? venue?.stampsRequired ?? 10;
  const stamps = me?.stamps ?? 0;

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />

      <div className="mx-auto max-w-xl px-6 py-10 md:py-16">
        {/* Venue header */}
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-hero-cyan">{t('loy.eyebrow')}</p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
            {venue?.name ?? '…'}
          </h1>
          {venueError && (
            <p className="mt-2 text-sm text-red-300">{venueError}</p>
          )}

        </div>

        {/* Happy Hour — gold pulsing banner while the window is live. The
            countdown lives inside VenueContact below, where it can also say
            when the NEXT one starts. */}
        {venue?.happyHour?.active && (
          <div className="mt-4 animate-pulse rounded-xl border-2 border-hero-gold bg-hero-gold/15 p-3 text-center text-sm font-bold text-hero-gold">
            {t('loy.hh.active', { m: venue.happyHour.mult })}
          </div>
        )}

        {/* The venue's own details: a loyalty card is also a small storefront
            for the café whose card it is. */}
        <VenueContact
          name={venue?.name ?? ''}
          branding={(venue?.branding ?? null)}
          gpsLat={venue?.gpsLat}
          gpsLng={venue?.gpsLng}
          happyHourNext={venue?.happyHourNext ?? null}
        />

        {/* Celebration overlay when a card was just completed & redeemed */}
        <AnimatePresence>
          {celebrating && (
            <motion.div
              key="celebrate"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 rounded-2xl border border-solana-green/40 bg-solana-green/10 p-5 text-center"
            >
              <p className="font-display text-xl font-semibold text-solana-green">
                {t('loy.celebrate.title')}
              </p>
              <p className="mt-1 text-sm text-slate-300">
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
                  className="mt-4 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-hero-deep shadow transition hover:bg-hero-gold-bright"
                >
                  {t('loy.review.btn')}
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6 backdrop-blur md:p-8">
          <PowerMeter current={Math.min(stamps, required)} required={required} justCharged={justCharged} />

          {/* Full card → the customer generates a ONE-TIME redeem code on their
              own phone (proof of presence); the barista types that to redeem. */}
          {me?.canRedeem && !redeemCode && (
            <div className="mt-5 rounded-xl border border-hero-gold/40 bg-hero-gold/10 p-4 text-center">
              <p className="text-sm text-hero-gold">{t('loy.full.title')}</p>
              <button
                type="button"
                disabled={redeemBusy}
                onClick={() => void requestRedeemCode()}
                className="mt-3 rounded-full bg-hero-gold px-6 py-2.5 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-50"
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

          <div className="mt-6 border-t border-hero-blue/15 pt-6">
            {!ready ? null : !authenticated ? (
              <div className="text-center">
                <p className="mb-3 text-xs text-slate-500">{t('loy.login.hint')}</p>
                <button
                  type="button"
                  onClick={login}
                  className="rounded-full bg-solana-purple px-6 py-2.5 font-medium text-white shadow-hero-purple transition hover:bg-solana-purple-deep"
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
          <div className="mt-6 rounded-2xl border border-solana-green/25 bg-solana-green/5 p-5 text-center">
            <p className="font-display font-semibold text-solana-green">
              🤝 {t('ref.title')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{t('ref.body')}</p>
            <button
              type="button"
              onClick={() => void shareInvite()}
              className="mt-3 rounded-full bg-solana-green px-6 py-2.5 text-sm font-semibold text-hero-deep transition hover:brightness-110"
            >
              {refShareState === 'copied' ? t('ref.copied') : t('ref.btn')}
            </button>
            <p className="mt-2 text-[11px] text-slate-600">{t('ref.hint')}</p>
          </div>
        )}

        {/* Asked once, only after the customer has stamps worth coming back for. */}
        <ConsentPrompt show={Boolean(me && me.totalStamps >= 2)} />

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
          {t('loy.footnote')}
        </p>
      </div>
    </section>
  );
}
