import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';

// Profile card showing the user's identity, all linked Solana wallets, and
// account-management actions.
//
// Multi-wallet design:
//   - Privy returns BOTH the embedded wallet (auto-provisioned via login) AND
//     any external wallet the user linked (Phantom/Solflare). We render every
//     Solana wallet in the array, each with its own copy + export controls.
//   - There is no "primary" wallet — for the claim flow we currently default
//     to wallets[0], but a user can pick which one to mint into via a future
//     "Mint to" selector (Day 4 polish).
//
// Export key:
//   - useSolanaWallets().exportWallet({ address }) is the SOLANA export entry.
//     usePrivy().exportWallet() is the EVM equivalent and rejects base58
//     addresses with an "invalid address" error from ethers.js.
//   - Embedded wallets only — external wallets manage their own keys.

export default function ProfileWallet() {
  const { user } = usePrivy();
  const {
    wallets,
    ready: walletsReady,
    createWallet,
    exportWallet,
  } = useSolanaWallets();

  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [exportingAddr, setExportingAddr] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Anti-duplicate: if user.linkedAccounts already contains a Solana wallet,
  // even when wallets[] is briefly empty, we DON'T show "Create wallet" — the
  // SDK is just catching up. Stops accidental duplicate provisioning.
  const hasLinkedSolanaWallet = Boolean(
    user?.linkedAccounts?.some(
      (a) =>
        a.type === 'wallet' &&
        (a as unknown as { chainType?: string }).chainType === 'solana'
    )
  );

  // Self-heal: if the embedded wallet was never provisioned (login happened in
  // a private/incognito window, or an older account predates auto-creation),
  // retry once automatically. The manual "Create" button stays as fallback.
  const triedAutoCreate = useRef(false);
  useEffect(() => {
    if (!walletsReady || wallets.length > 0 || hasLinkedSolanaWallet) return;
    if (triedAutoCreate.current) return;
    triedAutoCreate.current = true;
    setCreating(true);
    createWallet()
      .catch(() => {
        /* blocked — user still has the manual button */
      })
      .finally(() => setCreating(false));
  }, [walletsReady, wallets.length, hasLinkedSolanaWallet, createWallet]);

  const handleCopy = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddr(address);
    window.setTimeout(() => setCopiedAddr(null), 1500);
  };

  const handleCreateWallet = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      await createWallet();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Wallet creation failed.');
    } finally {
      setCreating(false);
    }
  };

  const handleExportKey = async (address: string) => {
    setExportingAddr(address);
    setExportError(null);
    try {
      await exportWallet({ address });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExportingAddr(null);
    }
  };

  // ---- Empty / loading states --------------------------------------------

  if (!walletsReady) {
    // Browser wallet extensions (MetaMask etc.) can stall the Solana hook's
    // initialization indefinitely. The wallet still EXISTS — its address is in
    // user.linkedAccounts — so after a short grace period we show a read-only
    // view instead of an eternal spinner. Export needs the full hook, so that
    // action waits for a page where init succeeds.
    const linkedAddr = (
      user?.linkedAccounts?.find(
        (a) => a.type === 'wallet' && (a as { chainType?: string }).chainType === 'solana'
      ) as { address?: string } | undefined
    )?.address;

    if (linkedAddr) {
      return (
        <div className="rounded-2xl border border-hero-blue/20 bg-hero-deep/40 p-5 md:p-8">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-wider text-slate-500">Solana wallets</p>
            <p className="text-xs text-slate-600">1 wallet</p>
          </div>
          <div className="mt-3 rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full break-all rounded bg-hero-deep/80 px-2.5 py-1.5 font-mono text-[11px] text-hero-cyan md:text-xs">
                {linkedAddr}
              </code>
              <span className="rounded-full border border-hero-gold/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-hero-gold">
                Embedded
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(linkedAddr)}
                className="rounded-full border border-hero-blue/40 px-3 py-1 text-xs text-slate-300 transition hover:border-hero-cyan hover:text-white"
              >
                {copiedAddr === linkedAddr ? 'Copied!' : 'Copy address'}
              </button>
              <p className="text-[11px] text-slate-500">
                Secured by your login · full controls (key export) load with the
                wallet service — a browser extension may be delaying it.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-hero-blue/20 bg-hero-deep/40 p-8">
        <p className="text-slate-400">Loading wallet…</p>
      </div>
    );
  }

  if (wallets.length === 0) {
    if (hasLinkedSolanaWallet) {
      return (
        <div className="rounded-2xl border border-hero-blue/20 bg-hero-deep/40 p-8 text-center">
          <p className="text-slate-300">
            Wallet provisioning… this usually takes a couple of seconds.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Refresh the page if it doesn't appear in 10s.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4 rounded-2xl border border-hero-blue/20 bg-hero-deep/40 p-6 text-center md:p-8">
        <p className="text-slate-300">
          You don't have a Solana wallet yet. Create one in a click — Privy
          secures it with your login, no seed phrase to write down.
        </p>
        <button
          type="button"
          onClick={handleCreateWallet}
          disabled={creating}
          className="rounded-full bg-hero-gold px-6 py-2.5 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create my Solana wallet'}
        </button>
        {createError && (
          <p className="text-xs text-red-400">{createError}</p>
        )}
      </div>
    );
  }

  // ---- Connected state ---------------------------------------------------

  return (
    <div className="space-y-6 rounded-2xl border border-hero-blue/20 bg-hero-deep/40 p-5 md:p-8">
      {/* Wallets — render each one with copy + export. */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Solana wallets
          </p>
          <p className="text-xs text-slate-600">
            {wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'}
          </p>
        </div>

        {wallets.map((w) => {
          const addr = w.address;
          const isEmbedded = w.walletClientType === 'privy';
          return (
            <div
              key={addr}
              className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full break-all rounded bg-hero-deep/80 px-2.5 py-1.5 font-mono text-[11px] text-hero-cyan md:text-xs">
                  {addr}
                </code>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                    isEmbedded
                      ? 'border-hero-gold/40 text-hero-gold'
                      : 'border-solana-purple/40 text-solana-purple'
                  }`}
                >
                  {isEmbedded ? 'Embedded' : (w.walletClientType ?? 'External')}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(addr)}
                  className="rounded-full border border-hero-blue/40 px-3 py-1 text-xs text-slate-300 transition hover:border-hero-cyan hover:text-white"
                >
                  {copiedAddr === addr ? 'Copied!' : 'Copy address'}
                </button>
                {isEmbedded && (
                  <button
                    type="button"
                    onClick={() => handleExportKey(addr)}
                    disabled={exportingAddr === addr}
                    className="rounded-full border border-hero-cyan/40 px-3 py-1 text-xs text-hero-cyan transition hover:border-hero-cyan hover:bg-hero-cyan/10 disabled:opacity-50"
                  >
                    {exportingAddr === addr ? 'Opening…' : 'Export key'}
                  </button>
                )}
                <p className="ml-auto self-center text-[11px] text-slate-500">
                  {isEmbedded
                    ? 'Secured by your login'
                    : 'You hold the keys'}
                </p>
              </div>
            </div>
          );
        })}

        {exportError && (
          <p className="text-xs text-red-400">{exportError}</p>
        )}
        <div className="space-y-1.5 text-[11px] text-slate-500">
          <p>
            Embedded wallets are controlled by your login. External wallets
            (Phantom, Solflare) you manage with their own seed phrase.
          </p>
          <p className="rounded-md border border-hero-blue/15 bg-hero-deep/40 px-2.5 py-2 text-slate-400">
            <span className="text-hero-cyan">Importing in Phantom?</span>{' '}
            Choose <strong className="text-slate-300">"Import private key"</strong>,
            NOT "Import secret recovery phrase". Privy embedded wallets are
            single-key (MPC), not seed-based.
          </p>
        </div>
      </div>

    </div>
  );
}
