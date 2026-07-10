import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';

import { getJson, postJson } from '../services/apiClient';
import { hapticTap } from '../services/platformService';

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
  hasOwner: boolean;
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

export default function Business() {
  const [params] = useSearchParams();
  const slug = params.get('venue') ?? VENUE_SLUG_DEFAULT;
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();

  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  const [codeInput, setCodeInput] = useState('');
  const [redeemInput, setRedeemInput] = useState('');
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

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
      await postJson(`/api/loyalty/venue/${slug}/claim-ownership`, {}, token ?? undefined);
      setIsOwner(true);
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
      const r = await postJson<{ code: string; count: number }, { ok: true } & CustomerInfo>(
        `/api/loyalty/merchant/${slug}/grant`,
        { code: customer.code, count },
        token ?? undefined
      );
      hapticTap(15);
      setCustomer({ ...customer, stamps: r.stamps, canRedeem: r.canRedeem });
      setNotice({
        kind: 'ok',
        text: `+${count} ${count === 1 ? 'stamp' : 'stamps'} → now ${r.stamps}/${r.required}`,
      });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as ApiErr).message });
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (!customer) return;
    const rc = redeemInput.trim().toUpperCase();
    if (!CODE_RE.test(rc)) {
      setNotice({ kind: 'err', text: 'Ask the customer for their 6-character reward code.' });
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
          ? '🎉 Reward redeemed + Super Victor Trophy minted to the customer! Hand it over.'
          : `🎉 Reward redeemed — hand it over! ${r.trophySkipped ?? ''}`,
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
          <p className="mt-1 text-sm text-slate-400">Merchant counter · grant &amp; redeem stamps</p>
        </div>

        <div className="mt-8 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6 backdrop-blur md:p-8">
          {!ready ? null : !authenticated ? (
            <div className="text-center">
              <p className="mb-3 text-sm text-slate-400">
                Log in with the merchant account for {venue?.name ?? 'this venue'}.
              </p>
              <button
                type="button"
                onClick={login}
                className="rounded-full bg-solana-purple px-6 py-2.5 font-medium text-white shadow-hero-purple transition hover:bg-solana-purple-deep"
              >
                Merchant login
              </button>
            </div>
          ) : isOwner === false && venue && !venue.hasOwner ? (
            <div className="text-center">
              <p className="mb-3 text-sm text-slate-400">
                This venue has no merchant yet. Claim it with this account (validation setup).
              </p>
              <button
                type="button"
                onClick={handleClaimOwnership}
                disabled={claiming}
                className="rounded-full bg-hero-gold px-6 py-2.5 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-50"
              >
                {claiming ? 'Claiming…' : 'Become merchant of this venue'}
              </button>
            </div>
          ) : isOwner === false ? (
            <div className="text-center text-sm text-red-300">
              This account is not the merchant of {venue?.name ?? 'this venue'}.
              <button type="button" onClick={logout} className="ml-2 underline">
                Switch account
              </button>
            </div>
          ) : (
            <>
              {/* Customer code entry */}
              <label htmlFor="code" className="text-xs uppercase tracking-wider text-slate-500">
                Customer code (6 characters)
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
                  className="flex-1 rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-slate-100 placeholder:text-slate-700 focus:border-hero-cyan focus:outline-none focus:ring-1 focus:ring-hero-cyan"
                />
                <button
                  type="button"
                  disabled={!codeValid || busy}
                  onClick={() => void lookupCustomer(normalizedCode)}
                  className="shrink-0 rounded-lg bg-hero-blue px-4 font-medium text-white transition hover:bg-hero-blue-bright disabled:opacity-40"
                >
                  Find
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
                      <p className="mb-2 text-xs text-slate-500">Coffees bought:</p>
                      <div className="grid grid-cols-3 gap-2">
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
                      </div>
                    </div>

                    {customer.canRedeem && (
                      <div className="mt-4 rounded-xl border border-hero-gold/40 bg-hero-gold/10 p-3">
                        <p className="text-xs text-hero-gold">
                          ⚡ Card full! Ask the customer to tap{' '}
                          <strong>“Claim reward”</strong> on their phone and tell you
                          the 6-character reward code:
                        </p>
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
                            className="flex-1 rounded-lg border border-hero-gold/40 bg-hero-deep/80 px-3 py-2 text-center font-mono text-xl tracking-[0.25em] text-hero-gold placeholder:text-slate-700 focus:border-hero-gold focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={busy || !CODE_RE.test(redeemInput)}
                            onClick={() => void redeem()}
                            className="shrink-0 rounded-full bg-hero-gold px-4 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-40"
                          >
                            Redeem
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
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
          Merchant-only. Every grant is attributed to your account for audit.
        </p>
      </div>
    </section>
  );
}
