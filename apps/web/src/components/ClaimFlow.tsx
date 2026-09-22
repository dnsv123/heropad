import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { usePrivy } from '../lib/auth';
import { useSolanaWallets } from '../lib/auth';

import { postClaim, type ApiCallError } from '../lib/api';
import { explorerAddress } from '../lib/explorer';

// localStorage backup for an in-progress claim. We persist the parsed
// {code, signature} pair when the URL has them, so a refresh / accidental
// navigation doesn't erase the claim. Self-expires after 10 minutes.
const LS_KEY = 'heropad:pending-claim';
const LS_TTL_MS = 10 * 60 * 1000;

interface PendingClaim {
  code: string;
  signature: string;
  ts: number;
}

function readPendingClaim(): PendingClaim | null {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingClaim;
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > LS_TTL_MS) {
      window.localStorage.removeItem(LS_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePendingClaim(p: { code: string; signature: string }): void {
  try {
    window.localStorage.setItem(
      LS_KEY,
      JSON.stringify({ ...p, ts: Date.now() })
    );
  } catch {
    /* localStorage may be disabled in private mode — fail silently */
  }
}

function clearPendingClaim(): void {
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch {
    /* no-op */
  }
}

interface ClaimFlowProps {
  /** Pre-filled claim code from the URL (?c=ABC). */
  initialCode?: string | null;
}

type Status =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'success'; mintAddress: string; bitsAwarded: number; txSignature: string }
  | { phase: 'error'; code: string; message: string };

const explorerLink = explorerAddress;

function explainError(code: string, fallback: string): string {
  switch (code) {
    case 'unknown_code':
      return 'This code is not recognized. Make sure you scanned a real HeroPad item.';
    case 'already_claimed':
      return 'This hero has already been claimed. Each code works exactly once — by design.';
    case 'bad_signature':
      return 'The signature did not verify. The QR/NFC may be damaged, copied incorrectly, or counterfeit.';
    case 'bad_code':
      return 'Code format is invalid. Expected HVPD-XXXX-XXXX.';
    case 'missing_signature':
      return 'We need the signed link, not just the code. Scan the QR/NFC again, or paste the full URL printed on your card.';
    case 'network_error':
      return 'We can’t reach the HeroPad API. Check your internet, or try again in a moment.';
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';
    default:
      return fallback || 'Something went wrong. Please try again.';
  }
}

// Heuristics for parsing whatever the user pastes / types.
const HEX64 = /^[a-f0-9]{64}$/i;
const CODE_RE = /^HVPD-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

interface ParsedClaim {
  code: string | null;
  signature: string | null;
  hint?: 'just_code' | 'invalid';
}

/**
 * Smart-parse the user's input. Accepts:
 *   - Full URL:           https://heropad.vercel.app/claim?c=HVPD-...&s=<hex>
 *   - Combined payload:   HVPD-XXXX-XXXX:<hex>
 *   - Just the code:      HVPD-XXXX-XXXX            (returns hint='just_code')
 *   - Garbage:            anything else             (returns hint='invalid')
 */
function parseClaimInput(raw: string): ParsedClaim {
  const trimmed = raw.trim();
  if (!trimmed) return { code: null, signature: null };

  // 1. URL form
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const c = (u.searchParams.get('c') ?? '').toUpperCase();
      const s = (u.searchParams.get('s') ?? '').toLowerCase();
      if (CODE_RE.test(c) && HEX64.test(s)) return { code: c, signature: s };
      if (CODE_RE.test(c)) return { code: c, signature: null, hint: 'just_code' };
      return { code: null, signature: null, hint: 'invalid' };
    } catch {
      return { code: null, signature: null, hint: 'invalid' };
    }
  }

  // 2. Combined "CODE:SIG"
  if (trimmed.includes(':')) {
    const [c, s] = trimmed.split(':').map((x) => x.trim());
    const codeUp = (c ?? '').toUpperCase();
    const sigLow = (s ?? '').toLowerCase();
    if (CODE_RE.test(codeUp) && HEX64.test(sigLow)) {
      return { code: codeUp, signature: sigLow };
    }
    return { code: null, signature: null, hint: 'invalid' };
  }

  // 3. Just the code, no signature
  const codeUp = trimmed.toUpperCase();
  if (CODE_RE.test(codeUp)) {
    return { code: codeUp, signature: null, hint: 'just_code' };
  }

  return { code: null, signature: null, hint: 'invalid' };
}

export default function ClaimFlow({ initialCode = null }: ClaimFlowProps) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [params] = useSearchParams();

  // Pre-build the input value if we landed via ?c=&s= URL.
  const initialSignature = params.get('s') ?? '';
  // If URL doesn't carry the pair, fall back to whatever we persisted last
  // time (within the 10-minute window) so a stray refresh / navigation
  // doesn't make the user re-scan.
  const persisted = !initialCode || !initialSignature ? readPendingClaim() : null;
  const effectiveCode = initialCode ?? persisted?.code ?? null;
  const effectiveSig = initialSignature || persisted?.signature || '';

  const initialInput =
    effectiveCode && effectiveSig
      ? `${effectiveCode}:${effectiveSig}`
      : effectiveCode ?? '';

  const [input, setInput] = useState(initialInput);
  const [status, setStatus] = useState<Status>({ phase: 'idle' });
  // IMPORTANT: every useState/useEffect must live at the top of the function
  // body, BEFORE any conditional return. Hooks called after `if (success) return …`
  // would change the hook count between renders → React error #300.
  const [scanHelpOpen, setScanHelpOpen] = useState(false);
  const restoredFromStorage = !initialCode && persisted !== null;

  // Whenever a fresh URL ?c=&s= arrives, persist for 10 min.
  useEffect(() => {
    if (initialCode && initialSignature) {
      writePendingClaim({ code: initialCode, signature: initialSignature });
    }
  }, [initialCode, initialSignature]);

  const parsed = parseClaimInput(input);

  // Auto-submit when both come from the URL (or were restored from
  // localStorage), the user is authenticated, and we have a wallet.
  useEffect(() => {
    if (
      effectiveCode &&
      effectiveSig &&
      authenticated &&
      wallets.length > 0 &&
      status.phase === 'idle'
    ) {
      void submit(effectiveCode.toUpperCase(), effectiveSig.toLowerCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCode, effectiveSig, authenticated, wallets.length]);

  async function submit(c: string, s: string) {
    const walletAddress = wallets[0]?.address;
    if (!walletAddress) {
      setStatus({
        phase: 'error',
        code: 'no_wallet',
        message: 'Your digital vault is not ready yet. Open your Profile once — it sets itself up.',
      });
      return;
    }

    setStatus({ phase: 'submitting' });
    try {
      const token = await getAccessToken();
      if (!token) {
        setStatus({ phase: 'error', code: 'unauthorized', message: 'Please sign in again.' });
        return;
      }
      const res = await postClaim(
        {
          code: c,
          signature: s,
          walletAddress,
          scanMethod: 'qr_card',
        },
        token
      );
      // Successful claim — we no longer need the persisted pending claim.
      clearPendingClaim();
      setStatus({
        phase: 'success',
        mintAddress: res.cnftMintAddress,
        bitsAwarded: res.bitsAwarded,
        txSignature: res.txSignature,
      });
    } catch (err) {
      const apiErr = err as ApiCallError;
      // If the code was already claimed or unknown, the persisted entry is
      // stale — drop it so we don't auto-retry on every page load.
      if (apiErr.code === 'already_claimed' || apiErr.code === 'unknown_code' ||
          apiErr.code === 'bad_signature' || apiErr.code === 'bad_code') {
        clearPendingClaim();
      }
      setStatus({
        phase: 'error',
        code: apiErr.code ?? 'unknown_error',
        message: explainError(apiErr.code ?? 'unknown_error', apiErr.message),
      });
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed.code && parsed.signature) {
      void submit(parsed.code, parsed.signature);
      return;
    }
    if (parsed.hint === 'just_code') {
      setStatus({
        phase: 'error',
        code: 'missing_signature',
        message: explainError('missing_signature', ''),
      });
      return;
    }
    setStatus({
      phase: 'error',
      code: 'bad_code',
      message: 'We could not parse that. Paste the full link from your QR code, or tap your NFC figurine again.',
    });
  };

  const canSubmit =
    ready &&
    authenticated &&
    wallets.length > 0 &&
    parsed.code !== null &&
    parsed.signature !== null &&
    status.phase !== 'submitting';

  // ---- Success state -----------------------------------------------------
  if (status.phase === 'success') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="space-y-5 rounded-2xl border border-solana-green/40 bg-hero-navy p-6 backdrop-blur md:p-8"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-solana-green/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                stroke="#14F195" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-display text-xl font-semibold text-white">
                Claimed!
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                Your Solana cNFT is in your wallet.{' '}
                <span className="text-solana-green">+{status.bitsAwarded} BITS</span> earned.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-white/[0.08] bg-hero-navy p-4 text-xs">
            <div>
              <p className="uppercase tracking-wider text-slate-500">Certificate ID</p>
              <code className="mt-1 block break-all font-mono text-hero-cyan">
                {status.mintAddress}
              </code>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={explorerLink(status.mintAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-hero-cyan/40 px-3 py-1.5 text-hero-cyan transition hover:border-white/30 hover:bg-hero-cyan/10"
              >
                Verify this hero ↗
              </a>
              <a
                href="/profile"
                className="rounded-full border border-white/15 px-3 py-1.5 text-slate-300 transition hover:border-white hover:text-white"
              >
                Go to my profile →
              </a>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---- Form / error state ------------------------------------------------
  // Visual hints under the input.
  const inputState =
    parsed.code && parsed.signature
      ? { color: 'text-solana-green', text: '✓ Looks good — ready to claim' }
      : parsed.hint === 'just_code'
      ? { color: 'text-amber-400', text: 'Code looks valid — paste the full link with signature, or scan the QR/NFC.' }
      : input.length > 0 && parsed.hint === 'invalid'
      ? { color: 'text-red-400', text: 'Could not parse. Paste the full URL from your QR / NFC.' }
      : null;

  return (
    <>
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-white/[0.08] bg-hero-navy p-6 backdrop-blur md:p-8"
    >
      {restoredFromStorage && (
        <div className="rounded-xl border border-hero-cyan/30 bg-hero-cyan/5 p-3 text-xs text-hero-cyan">
          ↻ Restored your last scanned link from this browser. Confirm below to claim.
        </div>
      )}
      <div>
        <label
          htmlFor="claim-input"
          className="text-xs uppercase tracking-wider text-slate-500"
        >
          Claim link or code
        </label>
        <div className="mt-2 flex items-stretch gap-2">
          <input
            id="claim-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your scanned URL or HVPD-XXXX-XXXX:signature"
            className="flex-1 rounded-lg border border-white/15 bg-hero-deep px-4 py-3 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-hero-cyan focus:outline-none focus:ring-1 focus:ring-hero-cyan"
          />
          <button
            type="button"
            onClick={() => setScanHelpOpen(true)}
            className="shrink-0 rounded-lg border border-hero-cyan/30 px-3 py-2 text-xs text-slate-300 transition hover:border-white/30 hover:text-white"
            aria-label="How to scan a HeroPad QR or NFC"
          >
            Scan
          </button>
        </div>
        {inputState ? (
          <p className={`mt-2 text-xs ${inputState.color}`}>{inputState.text}</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Tip: tap your figurine (NFC) or scan its QR card — the link auto-fills here.
          </p>
        )}
      </div>

      {status.phase === 'error' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {status.message}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          {!authenticated
            ? 'Log in to add this hero to your collection.'
            : wallets.length === 0
            ? 'Your vault is still being set up — open your Profile once.'
            : 'Logged in · ready to add it to your collection.'}
        </p>

        {!authenticated ? (
          <button
            type="button"
            onClick={login}
            disabled={!ready}
            className="rounded-full bg-hero-gold px-6 py-2.5 font-semibold text-hero-deep transition hover:bg-hero-gold-bright disabled:opacity-50"
          >
            Login to claim
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-hero-gold px-6 py-2.5 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status.phase === 'submitting' ? 'Minting…' : 'Confirm claim'}
          </button>
        )}
      </div>
    </form>

    {/* Scan-help modal — explains how scanning actually works (camera-app
        first, NFC tap, in-app scanner roadmap). Triggered by the Scan button. */}
    <AnimatePresence>
      {scanHelpOpen && (
        <motion.div
          key="scan-help-bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setScanHelpOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/15 bg-hero-deep p-6 shadow-2xl"
          >
            <h3 className="font-display text-lg font-semibold text-hero-cyan">
              How to scan your HeroPad item
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              You don't actually scan inside this app — your phone does it for you.
              Pick the kind of item you have:
            </p>

            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-white/[0.08] bg-hero-navy p-3">
                <p className="text-hero-gold">QR card / pack sticker</p>
                <p className="mt-1 text-xs text-slate-300">
                  Open your phone's <strong>Camera</strong> app, point at the QR.
                  When the URL bubble pops up, tap it — HeroPad opens with the
                  claim ready.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-hero-navy p-3">
                <p className="text-hero-cyan">NFC figurine</p>
                <p className="mt-1 text-xs text-slate-300">
                  Unlock your phone, then tap it to the figurine's base. Most
                  modern phones (iOS 14+, Android 9+) read NFC URLs without any
                  extra app.
                </p>
              </div>
              <div className="rounded-xl border border-dashed border-slate-700 p-3">
                <p className="text-slate-400">In-app scanner</p>
                <p className="mt-1 text-xs text-slate-500">
                  Coming after the hackathon — for now, the camera app does the
                  job perfectly.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setScanHelpOpen(false)}
              className="mt-5 w-full rounded-full bg-hero-gold px-4 py-2 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
