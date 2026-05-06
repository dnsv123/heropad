import { useState } from 'react';
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
  const { user, linkEmail, linkGoogle, linkWallet } = usePrivy();
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
      {/* Identity row — avatar + email */}
      <div className="flex items-start gap-4">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-hero-cyan/30 bg-gradient-to-br from-hero-blue/30 to-hero-deep md:h-16 md:w-16">
          <img
            src="/super-victor-pfp.png"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-slate-500">Account</p>
          <p className="mt-1 truncate text-sm text-slate-200">
            {user?.email?.address ?? user?.google?.email ?? '—'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Joined{' '}
            {user?.createdAt
              ? new Date(user.createdAt).toLocaleDateString()
              : '—'}
          </p>
        </div>
      </div>

      {/* Wallets — render each one with copy + export. */}
      <div className="space-y-3 border-t border-hero-blue/15 pt-5">
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

      {/* Linked accounts / link buttons */}
      <div className="space-y-3 border-t border-hero-blue/15 pt-5">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Linked methods
        </p>
        <div className="flex flex-wrap gap-2">
          {!user?.email && (
            <button
              type="button"
              onClick={linkEmail}
              className="rounded-full border border-hero-blue/40 bg-hero-deep/50 px-4 py-2 text-xs text-slate-200 transition hover:border-hero-cyan hover:text-white"
            >
              + Link email
            </button>
          )}
          {!user?.google && (
            <button
              type="button"
              onClick={linkGoogle}
              className="rounded-full border border-hero-blue/40 bg-hero-deep/50 px-4 py-2 text-xs text-slate-200 transition hover:border-hero-cyan hover:text-white"
            >
              + Link Google
            </button>
          )}
          <button
            type="button"
            onClick={linkWallet}
            className="rounded-full border border-hero-blue/40 bg-hero-deep/50 px-4 py-2 text-xs text-slate-200 transition hover:border-solana-purple hover:text-white"
          >
            + Link external wallet
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Linking more methods means recovery via any of them and use of
          HeroPad on any device. External wallets stack — they don't replace
          your embedded wallet.
        </p>
      </div>

      {/* Collectibles placeholder — wired to /api/user/me on Day 4. */}
      <div className="rounded-xl border border-dashed border-hero-blue/30 p-4 text-center text-xs text-slate-500">
        BITS balance and your collectibles will appear here after your first claim.
      </div>
    </div>
  );
}
