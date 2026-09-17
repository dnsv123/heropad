import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '../lib/auth';
import { useSolanaWallets } from '../lib/auth';

import { useT } from '../i18n';

// Profile card for the user's "digital vault" — where trophies live.
//
// Language policy (deliberate):
//   The vault IS a Solana wallet, and every trophy IS a compressed NFT. We do
//   not hide that — we just stop leading with it. A customer at a café wants
//   to know their trophies are safe and theirs; a word like "wallet" or
//   "mint" makes them think they need to understand crypto to drink coffee.
//   So the surface speaks plainly, and the full technical truth lives one
//   click away in "Technical details" — including key export, which is what
//   makes "truly yours" more than a slogan. Never remove that disclosure:
//   plain language is fine, an unverifiable claim is not.
//
// Multi-vault design:
//   - Privy returns BOTH the embedded wallet (auto-provisioned via login) AND
//     any external wallet the user linked (Phantom/Solflare). We render every
//     Solana wallet in the array, each with its own copy + export controls.
//   - There is no "primary" wallet — the claim flow defaults to wallets[0].
//
// Export key:
//   - useSolanaWallets().exportWallet({ address }) is the SOLANA export entry.
//     usePrivy().exportWallet() is the EVM equivalent and rejects base58
//     addresses with an "invalid address" error from ethers.js.
//   - Embedded wallets only — external wallets manage their own keys.

export default function ProfileWallet() {
  const { user, linkWallet } = usePrivy();
  const { t } = useT();
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
      setCreateError(err instanceof Error ? err.message : 'Setup failed.');
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
    // initialization indefinitely. The vault still EXISTS — its address is in
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
        <div className="rounded-2xl border border-white/[0.08] bg-hero-navy p-5 md:p-8">
          <p className="text-xs uppercase tracking-wider text-slate-500">{t('w.section')}</p>
          <p className="mt-1 text-xs text-slate-500">{t('w.explain')}</p>
          <div className="mt-3 rounded-xl border border-white/[0.08] bg-hero-navy p-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full break-all rounded bg-hero-deep px-2.5 py-1.5 font-mono text-[11px] text-hero-cyan md:text-xs">
                {linkedAddr}
              </code>
              <span className="rounded-full border border-hero-gold/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-hero-gold">
                {t('w.badge.embedded')}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(linkedAddr)}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-300 transition hover:border-white/30 hover:text-white"
              >
                {copiedAddr === linkedAddr ? t('w.copied') : t('w.copy')}
              </button>
              <p className="text-[11px] text-slate-500">{t('w.secured')}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-white/[0.08] bg-hero-navy p-8">
        <p className="text-slate-400">{t('w.loading')}</p>
      </div>
    );
  }

  if (wallets.length === 0) {
    if (hasLinkedSolanaWallet) {
      return (
        <div className="rounded-2xl border border-white/[0.08] bg-hero-navy p-8 text-center">
          <p className="text-slate-300">{t('w.provisioning')}</p>
          <p className="mt-2 text-xs text-slate-500">{t('w.provisioning.hint')}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-hero-navy p-6 text-center md:p-8">
        <p className="text-slate-300">{t('w.create.hint')}</p>
        <button
          type="button"
          onClick={handleCreateWallet}
          disabled={creating}
          className="rounded-full bg-hero-gold px-6 py-2.5 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? t('w.create.busy') : t('w.create.btn')}
        </button>
        {createError && (
          <p className="text-xs text-red-400">{createError}</p>
        )}
      </div>
    );
  }

  // ---- Connected state ---------------------------------------------------

  return (
    <div className="space-y-6 rounded-2xl border border-white/[0.08] bg-hero-navy p-5 md:p-8">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            {t('w.section')}
          </p>
          <p className="shrink-0 text-xs text-slate-600">
            {wallets.length} {wallets.length === 1 ? t('w.count.one') : t('w.count.many')}
          </p>
        </div>
        <p className="text-xs text-slate-500">{t('w.explain')}</p>

        {wallets.map((w) => {
          const addr = w.address;
          const isEmbedded = w.walletClientType === 'privy';
          return (
            <div
              key={addr}
              className="rounded-xl border border-white/[0.08] bg-hero-navy p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full break-all rounded bg-hero-deep px-2.5 py-1.5 font-mono text-[11px] text-hero-cyan md:text-xs">
                  {addr}
                </code>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                    isEmbedded
                      ? 'border-hero-gold/40 text-hero-gold'
                      : 'border-hero-cyan/40 text-hero-cyan'
                  }`}
                >
                  {isEmbedded ? t('w.badge.embedded') : t('w.badge.external')}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(addr)}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-300 transition hover:border-white/30 hover:text-white"
                >
                  {copiedAddr === addr ? t('w.copied') : t('w.copy')}
                </button>
                <p className="ml-auto self-center text-[11px] text-slate-500">
                  {isEmbedded ? t('w.secured') : t('w.youhold')}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* The whole technical truth, one click away. Key export lives here
          rather than on the surface: the people who need it go looking for
          it, and the people who don't are never asked to care. */}
      <details className="rounded-xl border border-white/[0.08] bg-hero-navy">
        <summary className="cursor-pointer px-4 py-2.5 text-xs text-slate-400 transition hover:text-slate-200">
          {t('w.adv')}
        </summary>
        <div className="space-y-3 border-t border-white/[0.08] px-4 py-3">
          <p className="text-[11px] leading-relaxed text-slate-500">{t('w.adv.body')}</p>

          <div className="flex flex-wrap gap-2">
            {wallets
              .filter((w) => w.walletClientType === 'privy')
              .map((w) => (
                <button
                  key={w.address}
                  type="button"
                  onClick={() => handleExportKey(w.address)}
                  disabled={exportingAddr === w.address}
                  className="rounded-full border border-hero-cyan/40 px-3 py-1 text-xs text-hero-cyan transition hover:border-white/30 hover:bg-hero-cyan/10 disabled:opacity-50"
                >
                  {exportingAddr === w.address ? t('w.exporting') : t('w.export')}
                </button>
              ))}
            <button
              type="button"
              onClick={linkWallet}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-300 transition hover:border-white/30 hover:text-white"
            >
              {t('w.adv.link')}
            </button>
          </div>

          {exportError && <p className="text-xs text-red-400">{exportError}</p>}

          <p className="rounded-md border border-white/[0.08] bg-hero-navy px-2.5 py-2 text-[11px] leading-relaxed text-slate-400">
            {t('w.adv.import')}
          </p>
        </div>
      </details>
    </div>
  );
}
