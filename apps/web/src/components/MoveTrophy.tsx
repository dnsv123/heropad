import { useState } from 'react';
import { VersionedTransaction } from '@solana/web3.js';

import { usePrivy, useSolanaWallets } from '../lib/auth';
import { prepareTransfer, sendTransfer, type CollectibleSummary } from '../lib/api';
import { explorerTx } from '../lib/explorer';
import { useT } from '../i18n';

// Moving a trophy to a wallet the customer controls elsewhere.
//
// The flow is three steps behind one button: the API prepares a transfer
// with HeroPad as fee payer, Privy signs it with the embedded wallet (the
// signature that proves ownership), the API submits it. The confirmation
// text says plainly what will happen; nothing is sent until it is ticked.
//
// Language: "vault" and "address", never wallet/NFT/chain — same policy as
// ProfileWallet. The technical truth stays under "Technical details" there.

interface MoveTrophyProps {
  item: CollectibleSummary;
  /** The wallet the trophy currently sits in (from /api/user/me). */
  ownerAddress: string;
  /** Called after a confirmed move so the collection can reload. */
  onMoved?: () => void;
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// No Buffer in the browser bundle; base64 by hand.
function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export default function MoveTrophy({ item, ownerAddress, onMoved }: MoveTrophyProps) {
  const { t } = useT();
  const { getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();

  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const dest = to.trim();
  const destValid = BASE58.test(dest);
  const destIsSelf = dest === ownerAddress;
  const signer = wallets.find((w) => w.address === ownerAddress);
  const canMove = destValid && !destIsSelf && agreed && !busy && Boolean(signer?.signTransaction);

  const handleMove = async () => {
    if (!signer?.signTransaction) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('no_session');
      const prepared = await prepareTransfer(item.assetId, dest, token);
      const tx = VersionedTransaction.deserialize(fromBase64(prepared.transaction));
      const signed = await signer.signTransaction(tx);
      const sent = await sendTransfer(
        {
          transaction: toBase64(signed.serialize()),
          lastValidBlockHeight: prepared.lastValidBlockHeight,
          wallet: ownerAddress,
        },
        token
      );
      setSignature(sent.signature);
      onMoved?.();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'bad_address') setError(t('mv.err.addr'));
      else if (code === 'same_wallet') setError(t('mv.err.same'));
      else setError(t('mv.err'));
    } finally {
      setBusy(false);
    }
  };

  if (signature) {
    return (
      <div className="rounded-xl border border-hero-gold/40 bg-hero-gold/10 p-4 text-sm">
        <p className="text-slate-100">{t('mv.done')}</p>
        <a
          href={explorerTx(signature)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-semibold text-hero-gold underline-offset-2 hover:underline"
        >
          {t('mv.receipt')}
        </a>
      </div>
    );
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-xl border border-white/[0.08] bg-hero-navy"
    >
      <summary className="cursor-pointer px-4 py-2.5 text-xs text-slate-400 transition hover:text-slate-200">
        {t('mv.open')}
      </summary>
      <div className="space-y-3 border-t border-white/[0.08] px-4 py-3">
        <p className="text-[12px] leading-relaxed text-slate-400">{t('mv.body')}</p>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">{t('mv.addr')}</span>
          <input
            id={`mv-to-${item.assetId.slice(0, 8)}`}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t('mv.addr.ph')}
            className="mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-3 py-2 font-mono text-[12px] text-slate-100 outline-none placeholder:font-sans placeholder:text-slate-600 focus:border-hero-gold/60"
          />
        </label>
        {dest && !destValid && <p className="text-xs text-red-300">{t('mv.err.addr')}</p>}
        {destIsSelf && <p className="text-xs text-red-300">{t('mv.err.same')}</p>}

        <label className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-300">
          <input
            id={`mv-ok-${item.assetId.slice(0, 8)}`}
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-hero-gold"
          />
          <span>{t('mv.confirm')}</span>
        </label>

        <button
          type="button"
          onClick={handleMove}
          disabled={!canMove}
          className="btn btn-primary btn-sm w-full"
        >
          {busy ? t('mv.busy') : t('mv.btn')}
        </button>

        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>
    </details>
  );
}
