import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';

import PowerMeter from '../components/PowerMeter';
import { getJson } from '../services/apiClient';
import { hapticTap } from '../services/platformService';

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

export default function Loyalty() {
  const { slug = 'cafe-victor' } = useParams();
  const { ready, authenticated, login, getAccessToken } = usePrivy();

  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [justCharged, setJustCharged] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  // Previous values so polling can detect "something changed" and animate.
  const prevStamps = useRef<number | null>(null);
  const prevCards = useRef<number | null>(null);

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
  const fetchMe = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const r = await getJson<MeResponse>(`/api/loyalty/me/${slug}`, token);
      setMeError(null);

      // Detect changes for feedback BEFORE committing new state.
      if (prevStamps.current !== null && r.stamps > prevStamps.current) {
        setJustCharged(true);
        hapticTap(20);
        window.setTimeout(() => setJustCharged(false), 500);
      }
      if (prevCards.current !== null && r.cardsCompleted > prevCards.current) {
        setCelebrating(true);
        hapticTap(40);
        window.setTimeout(() => setCelebrating(false), 6000);
      }
      prevStamps.current = r.stamps;
      prevCards.current = r.cardsCompleted;
      setMe(r);
    } catch (err) {
      setMeError((err as Error).message);
    }
  }, [slug, getAccessToken]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void fetchMe();
    const id = window.setInterval(() => void fetchMe(), POLL_MS);
    const onFocus = () => void fetchMe();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
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
          <p className="text-xs uppercase tracking-[0.3em] text-hero-cyan">Loyalty</p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
            {venue?.name ?? '…'}
          </h1>
          {venueError && (
            <p className="mt-2 text-sm text-red-300">{venueError}</p>
          )}
        </div>

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
                🎉 Reward redeemed — enjoy!
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Your card restarted. Extra stamps carry over automatically.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6 backdrop-blur md:p-8">
          <PowerMeter current={Math.min(stamps, required)} required={required} justCharged={justCharged} />

          {/* Full-card call to action — redeem happens at the counter. */}
          {me?.canRedeem && (
            <p className="mt-5 rounded-xl border border-hero-gold/40 bg-hero-gold/10 p-3 text-center text-sm text-hero-gold">
              ⚡ Full power! Show your code below — the barista redeems your reward.
            </p>
          )}

          <div className="mt-6 border-t border-hero-blue/15 pt-6">
            {!ready ? null : !authenticated ? (
              <div className="text-center">
                <p className="mb-3 text-xs text-slate-500">
                  Login once to start collecting — takes ~10 seconds.
                </p>
                <button
                  type="button"
                  onClick={login}
                  className="rounded-full bg-solana-purple px-6 py-2.5 font-medium text-white shadow-hero-purple transition hover:bg-solana-purple-deep"
                >
                  Login to collect stamps
                </button>
              </div>
            ) : me ? (
              <div className="text-center">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Your code — show it at the counter
                </p>
                <motion.p
                  key={me.code}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mt-2 font-mono text-4xl font-bold tracking-[0.35em] text-hero-cyan"
                >
                  {me.code}
                </motion.p>
                <p className="mt-3 text-xs text-slate-500">
                  ☕ {me.totalStamps} stamps lifetime · 🎫 {me.cardsCompleted}{' '}
                  {me.cardsCompleted === 1 ? 'card' : 'cards'} completed
                </p>
              </div>
            ) : meError ? (
              <p className="text-center text-sm text-red-300">{meError}</p>
            ) : (
              <p className="text-center text-sm text-slate-500">Loading your card…</p>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
          Stamps are granted by the café at purchase and appear here live.
        </p>
      </div>
    </section>
  );
}
