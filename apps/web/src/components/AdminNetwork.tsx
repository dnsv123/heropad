import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '../lib/auth';

import { getJson, postJson } from '../services/apiClient';
import { explorerAddress } from '../lib/explorer';

// Admin → Network. The one screen that says which Solana network the API is
// on, whether the trophy wallet has money, and creates the trophy tree with
// one button. Exists so that going to mainnet never requires the admin key
// on anyone's laptop: the key stays on Railway, the button runs there.

interface NetInfo {
  cluster: 'devnet' | 'mainnet' | 'unknown';
  adminPubkey: string | null;
  balanceSol: number | null;
  tree: string | null;
  keyError: string | null;
}

export default function AdminNetwork() {
  const { getAccessToken } = usePrivy();
  const [info, setInfo] = useState<NetInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ address: string; signature: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const r = await getJson<{ ok: true } & NetInfo>('/api/admin/solana', token ?? undefined);
      setInfo(r);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTree() {
    if (!info) return;
    const ok = window.confirm(
      `Create the trophy tree on ${info.cluster.toUpperCase()}?\n\nThis spends rent from the admin wallet (about 0.06 SOL) and can only be done once per network.`
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<Record<string, never>, { ok: true; address: string; signature: string }>(
        '/api/admin/solana/tree',
        {},
        token ?? undefined
      );
      setCreated({ address: r.address, signature: r.signature });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const clusterTone =
    info?.cluster === 'mainnet'
      ? 'bg-solana-green/15 text-solana-green border-solana-green/40'
      : info?.cluster === 'devnet'
      ? 'bg-hero-gold/15 text-hero-gold border-hero-gold/40'
      : 'bg-red-500/10 text-red-300 border-red-500/40';

  const low = info?.balanceSol !== null && info?.balanceSol !== undefined && info.balanceSol < 0.1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">Network</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Where trophies are minted. The network comes from <code>SOLANA_RPC_URL</code> on
          Railway; the wallet from <code>SOLANA_ADMIN_PRIVATE_KEY</code>. Neither is shown here
          — only what an explorer would show.
        </p>
      </div>

      {err && (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</p>
      )}

      {info && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card-sm p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Cluster</p>
            <span className={`mt-2 inline-block rounded-full border px-3 py-1 font-display text-sm font-bold uppercase ${clusterTone}`}>
              {info.cluster}
            </span>
          </div>
          <div className="card-sm p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Trophy wallet</p>
            {info.adminPubkey ? (
              <>
                <a
                  href={explorerAddress(info.adminPubkey)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block truncate font-mono text-xs text-hero-cyan underline"
                  title={info.adminPubkey}
                >
                  {info.adminPubkey.slice(0, 6)}…{info.adminPubkey.slice(-6)}
                </a>
                <p className={`tnum mt-1 font-display text-2xl font-bold ${low ? 'text-red-300' : 'text-white'}`}>
                  {info.balanceSol === null ? '…' : info.balanceSol.toFixed(4)}{' '}
                  <span className="text-sm font-normal text-slate-500">SOL</span>
                </p>
                {low && (
                  <p className="mt-1 text-[11px] text-red-300">
                    Low. Send ~0.5 SOL to this address before creating the tree.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-red-300">{info.keyError ?? 'No admin key configured.'}</p>
            )}
          </div>
          <div className="card-sm p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Trophy tree ({info.cluster})</p>
            {info.tree ? (
              <a
                href={explorerAddress(info.tree)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block truncate font-mono text-xs text-hero-cyan underline"
                title={info.tree}
              >
                {info.tree.slice(0, 6)}…{info.tree.slice(-6)}
              </a>
            ) : (
              <>
                <p className="mt-2 text-xs text-slate-400">None yet on this network.</p>
                <button
                  type="button"
                  disabled={busy || !info.adminPubkey || low}
                  onClick={() => void createTree()}
                  className="btn btn-primary btn-sm mt-3"
                >
                  {busy ? 'Creating…' : 'Create trophy tree'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {created && (
        <div className="card-sm card-gold p-4 text-sm">
          <p className="font-semibold text-hero-gold">Tree created.</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-200">{created.address}</p>
          <a
            href={`https://explorer.solana.com/tx/${created.signature}${info?.cluster === 'devnet' ? '?cluster=devnet' : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-hero-cyan underline"
          >
            View transaction ↗
          </a>
        </div>
      )}

      <div className="card-sm p-4 text-[12px] leading-relaxed text-slate-400">
        <p className="font-semibold text-slate-200">Going to mainnet, in order</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Railway → API → Variables: <code>SOLANA_RPC_URL</code> = the Helius <b>mainnet</b> URL; <code>SOLANA_ADMIN_PRIVATE_KEY</code> = the mainnet wallet's key. Redeploy.</li>
          <li>Vercel → web → Environment: <code>VITE_SOLANA_CLUSTER</code> = <code>mainnet-beta</code>. Redeploy.</li>
          <li>Send ~0.5 SOL to the trophy wallet above. Refresh this page until the balance shows.</li>
          <li>Press <b>Create trophy tree</b>. Once.</li>
          <li>Complete one card on a test venue and open the trophy on the explorer.</li>
        </ol>
      </div>
    </div>
  );
}
