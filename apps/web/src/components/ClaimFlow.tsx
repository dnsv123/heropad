import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';

import { postClaim, type ApiCallError } from '../lib/api';

interface ClaimFlowProps {
  /** Pre-filled claim code from the URL (?c=ABC). */
  initialCode?: string | null;
}

// Possible UI states. Driven by API response, not by the input field state.
type Status =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'success'; mintAddress: string; bitsAwarded: number; txSignature: string }
  | { phase: 'error'; code: string; message: string };

// Solana Explorer link — devnet for now. Once we go mainnet, the cluster
// param drops or switches to mainnet-beta.
function explorerLink(asset: string): string {
  return `https://explorer.solana.com/address/${asset}?cluster=devnet`;
}

// Friendly mapping of API error codes → user-facing messages.
function explainError(code: string, fallback: string): string {
  switch (code) {
    case 'unknown_code':
      return 'This code is not recognized. Make sure you scanned a real HeroPad item.';
    case 'already_claimed':
      return 'This collectible has already been claimed. Each code is one-shot — by design.';
    case 'bad_signature':
      return 'The code signature did not verify. The QR/NFC may be damaged or counterfeit.';
    case 'bad_code':
      return 'Code format is invalid. Expected HVPD-XXXX-XXXX.';
    case 'network_error':
      return 'We can’t reach the HeroPad API. Check your internet, or try again in a moment.';
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';
    default:
      return fallback || 'Something went wrong. Please try again.';
  }
}

export default function ClaimFlow({ initialCode = null }: ClaimFlowProps) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [params] = useSearchParams();

  // The signature comes from the URL alongside the code (?c=...&s=...).
  // For manual code entry (typed in the field) we don't have a signature →
  // demo flow: when developing, we'd use seed-codes.ts which prints both.
  const initialSignature = params.get('s') ?? '';

  const [code, setCode] = useState(initialCode ?? '');
  const [signature, setSignature] = useState(initialSignature);
  const [status, setStatus] = useState<Status>({ phase: 'idle' });

  // Auto-submit when both `c` and `s` are in the URL, the user is authenticated,
  // and we have a wallet. This handles the "scan a QR → land here → claim" flow
  // with no extra clicks. (We still expose the form for manual entry / debug.)
  useEffect(() => {
    const c = initialCode;
    const s = initialSignature;
    if (
      c &&
      s &&
      authenticated &&
      wallets.length > 0 &&
      status.phase === 'idle'
    ) {
      // Don't await; let it kick off and the state machine takes over.
      void submit(c, s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, initialSignature, authenticated, wallets.length]);

  async function submit(c: string, s: string) {
    const walletAddress = wallets[0]?.address;
    if (!walletAddress) {
      setStatus({
        phase: 'error',
        code: 'no_wallet',
        message: 'You need a Solana wallet first. Go to Profile → Create wallet.',
      });
      return;
    }

    setStatus({ phase: 'submitting' });
    try {
      const res = await postClaim({
        code: c,
        signature: s,
        walletAddress,
        scanMethod: 'qr_card', // TODO Day 4: detect from URL params
      });
      setStatus({
        phase: 'success',
        mintAddress: res.cnftMintAddress,
        bitsAwarded: res.bitsAwarded,
        txSignature: res.txSignature,
      });
    } catch (err) {
      const apiErr = err as ApiCallError;
      setStatus({
        phase: 'error',
        code: apiErr.code ?? 'unknown_error',
        message: explainError(apiErr.code ?? 'unknown_error', apiErr.message),
      });
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !signature.trim()) return;
    void submit(code.trim().toUpperCase(), signature.trim().toLowerCase());
  };

  const canSubmit =
    ready &&
    authenticated &&
    wallets.length > 0 &&
    code.trim().length > 0 &&
    signature.trim().length > 0 &&
    status.phase !== 'submitting';

  // ---- Success state ------------------------------------------------------
  if (status.phase === 'success') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="space-y-5 rounded-2xl border border-solana-green/40 bg-hero-deep/60 p-6 backdrop-blur md:p-8"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-solana-green/20">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#14F195"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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

          <div className="space-y-3 rounded-xl border border-hero-blue/15 bg-hero-deep/40 p-4 text-xs">
            <div>
              <p className="uppercase tracking-wider text-slate-500">cNFT asset</p>
              <code className="mt-1 block break-all font-mono text-hero-cyan">
                {status.mintAddress}
              </code>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={explorerLink(status.mintAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-hero-cyan/40 px-3 py-1.5 text-hero-cyan transition hover:border-hero-cyan hover:bg-hero-cyan/10"
              >
                View on Solana Explorer ↗
              </a>
              <a
                href="/profile"
                className="rounded-full border border-hero-blue/40 px-3 py-1.5 text-slate-300 transition hover:border-white hover:text-white"
              >
                Go to my profile →
              </a>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---- Form / error state -------------------------------------------------
  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-6 backdrop-blur md:p-8"
    >
      <div>
        <label
          htmlFor="claim-code"
          className="text-xs uppercase tracking-wider text-slate-500"
        >
          Claim code
        </label>
        <div className="mt-2 flex items-stretch gap-2">
          <input
            id="claim-code"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="HVPD-XXXX-XXXX"
            className="flex-1 rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-4 py-3 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-hero-cyan focus:outline-none focus:ring-1 focus:ring-hero-cyan"
          />
          <button
            type="button"
            onClick={() => alert('Scanner coming soon — Day 4 build.')}
            className="shrink-0 rounded-lg border border-hero-cyan/30 px-3 py-2 text-xs text-slate-300 transition hover:border-hero-cyan hover:text-white"
            aria-label="Scan QR or NFC"
          >
            Scan
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Tip: tap your figurine (NFC) or scan a QR card to auto-fill this.
        </p>
      </div>

      <div>
        <label
          htmlFor="claim-sig"
          className="text-xs uppercase tracking-wider text-slate-500"
        >
          Signature <span className="text-slate-600">(from QR/NFC payload)</span>
        </label>
        <input
          id="claim-sig"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="64-char hex"
          className="mt-2 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-4 py-3 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-hero-cyan focus:outline-none focus:ring-1 focus:ring-hero-cyan"
        />
      </div>

      {status.phase === 'error' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {status.message}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-hero-blue/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          {!authenticated
            ? 'Login required to mint your collectible.'
            : wallets.length === 0
            ? 'Create a Solana wallet first (Profile page).'
            : 'Logged in · ready to mint to your Solana wallet.'}
        </p>

        {!authenticated ? (
          <button
            type="button"
            onClick={login}
            disabled={!ready}
            className="rounded-full bg-solana-purple px-6 py-2.5 font-medium text-white shadow-hero-purple transition hover:bg-solana-purple-deep disabled:opacity-50"
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
  );
}
