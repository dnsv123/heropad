import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '../lib/auth';

import { getJson, postJson } from '../services/apiClient';
import InfoTip from './InfoTip';

// Admin → Rewards. The shelf: what BITS can buy, at what price, how many are
// left, and where they are picked up. Plus every claim so far — who took what,
// where it was handed over, what is still open.

interface Item {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_bits: number;
  stock: number | null;
  venueSlugs: string[];
  sort_order: number;
  active: boolean;
}

interface Claim {
  id: string;
  item_name: string;
  item_slug: string;
  code: string;
  price_bits: number;
  status: string;
  venue_id: string | null;
  expires_at: string;
  fulfilled_at: string | null;
  created_at: string;
}

const EMPTY = {
  slug: '',
  name: '',
  description: '',
  imageUrl: '',
  priceBits: '300',
  stock: '',
  venueSlugs: '',
  sortOrder: '0',
  active: true,
};

const shortDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
};

export default function AdminRewards({
  onNotice,
}: {
  onNotice: (kind: 'ok' | 'err', text: string) => void;
}) {
  const { getAccessToken } = usePrivy();
  const [items, setItems] = useState<Item[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const r = await getJson<{ ok: true; items: Item[]; claims: Claim[] }>(
        '/api/admin/rewards',
        token ?? undefined
      );
      setItems(r.items);
      setClaims(r.claims);
    } catch (err) {
      onNotice('err', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const edit = (it: Item) => {
    setEditingSlug(it.slug);
    setForm({
      slug: it.slug,
      name: it.name,
      description: it.description ?? '',
      imageUrl: it.image_url ?? '',
      priceBits: String(it.price_bits),
      stock: it.stock === null ? '' : String(it.stock),
      venueSlugs: it.venueSlugs.join(', '),
      sortOrder: String(it.sort_order),
      active: it.active,
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const token = await getAccessToken();
      await postJson(
        '/api/admin/rewards',
        {
          slug: form.slug.trim().toLowerCase(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          imageUrl: form.imageUrl.trim() || undefined,
          priceBits: Number(form.priceBits),
          stock: form.stock.trim() === '' ? null : Number(form.stock),
          venueSlugs: form.venueSlugs
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          sortOrder: Number(form.sortOrder) || 0,
          active: form.active,
        },
        token ?? undefined
      );
      onNotice('ok', `Saved “${form.name.trim()}”.`);
      setForm(EMPTY);
      setEditingSlug(null);
      await load();
    } catch (err) {
      onNotice('err', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (it: Item) => {
    setBusy(true);
    try {
      const token = await getAccessToken();
      await postJson(
        '/api/admin/rewards',
        {
          slug: it.slug,
          name: it.name,
          priceBits: it.price_bits,
          stock: it.stock,
          venueSlugs: it.venueSlugs,
          active: !it.active,
        },
        token ?? undefined
      );
      await load();
    } catch (err) {
      onNotice('err', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input =
    'mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none';
  const pending = claims.filter((c) => c.status === 'pending');

  return (
    <div className="mt-8 space-y-6">
      {/* ---- The form ---- */}
      <div className="rounded-2xl border border-solana-green/30 bg-hero-deep/50 p-5">
        <h2 className="font-display text-lg font-semibold text-solana-green">
          {editingSlug ? `✏️ Edit: ${editingSlug}` : '➕ Add a reward'}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Put the image in <code className="text-hero-cyan">apps/web/public/rewards/</code> as
          WebP (square, ~600px) and reference it as{' '}
          <code className="text-hero-cyan">/rewards/name.webp</code>. Price it so the item is
          worth roughly 15–30 visits — see the How-to for the BITS economy.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            Slug (id, lowercase-dashes) *
            <input
              value={form.slug}
              disabled={Boolean(editingSlug)}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="pin-supervictor"
              className={`${input} disabled:opacity-50`}
            />
          </label>
          <label className="text-xs text-slate-500">
            Name *
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="SuperVictor enamel pin"
              className={input}
            />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Description
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Hard enamel, 35 mm, on a SuperVictor backing card."
              className={input}
            />
          </label>
          <label className="text-xs text-slate-500">
            Image path
            <input
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="/rewards/pin-supervictor.webp"
              className={input}
            />
          </label>
          <label className="text-xs text-slate-500">
            Price (BITS) *
            <input
              type="number"
              min={1}
              value={form.priceBits}
              onChange={(e) => setForm({ ...form, priceBits: e.target.value })}
              className={input}
            />
          </label>
          <label className="text-xs text-slate-500">
            Stock (empty = unlimited)
            <InfoTip text="Physical items: put the real count. It drops on every claim and comes back if the code expires unused. Digital rewards later: leave empty." />
            <input
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              placeholder="50"
              className={input}
            />
          </label>
          <label className="text-xs text-slate-500">
            Pick up at (venue slugs, comma-separated; empty = any)
            <InfoTip text="Only venues that physically HAVE the item in their display. A barista at a venue not on this list cannot hand it over — the code is refused there." />
            <input
              value={form.venueSlugs}
              onChange={(e) => setForm({ ...form, venueSlugs: e.target.value })}
              placeholder="cafe-victor, cafe-111"
              className={input}
            />
          </label>
          <label className="text-xs text-slate-500">
            Sort order
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              className={input}
            />
          </label>
          <label className="flex items-center gap-2 self-end text-xs text-slate-300">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-solana-green"
            />
            Visible on the shelf
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy || form.slug.trim().length < 2 || form.name.trim().length < 2}
            onClick={save}
            className="rounded-full bg-solana-green px-5 py-2 text-sm font-semibold text-hero-deep transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Saving…' : editingSlug ? 'Save changes' : 'Add to the shelf'}
          </button>
          {editingSlug && (
            <button
              type="button"
              onClick={() => {
                setEditingSlug(null);
                setForm(EMPTY);
              }}
              className="rounded-full border border-hero-blue/40 px-5 py-2 text-sm text-slate-300"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ---- The shelf ---- */}
      <div>
        <h3 className="font-display text-lg font-semibold text-white">
          The shelf {loading ? '…' : `(${items.length})`}
        </h3>
        {items.length === 0 && !loading && (
          <p className="mt-2 text-xs text-slate-500">Empty. Add the first reward above.</p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((it) => (
            <div
              key={it.slug}
              className={`flex gap-3 rounded-2xl border bg-hero-deep/50 p-3 ${
                it.active ? 'border-hero-blue/20' : 'border-hero-blue/10 opacity-60'
              }`}
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-hero-deep/80">
                {it.image_url ? (
                  <img src={it.image_url} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl">🎁</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{it.name}</p>
                <p className="text-[11px] text-slate-500">
                  <span className="text-solana-green">⚡ {it.price_bits}</span> ·{' '}
                  {it.stock === null ? '∞' : `${it.stock} left`} ·{' '}
                  {it.venueSlugs.length > 0 ? it.venueSlugs.join(', ') : 'any venue'}
                </p>
                <div className="mt-2 flex gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => edit(it)}
                    className="rounded-full border border-hero-blue/40 px-2.5 py-0.5 text-slate-300 hover:border-hero-cyan"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleActive(it)}
                    className="rounded-full border border-hero-blue/40 px-2.5 py-0.5 text-slate-300 hover:border-hero-gold"
                  >
                    {it.active ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Claims ---- */}
      <div>
        <h3 className="font-display text-lg font-semibold text-white">
          Claims {pending.length > 0 && <span className="text-hero-gold">· {pending.length} open</span>}
        </h3>
        {claims.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">None yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Code</th>
                  <th className="py-2 pr-3 font-medium">BITS</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Claimed</th>
                  <th className="py-2 font-medium">Handed over</th>
                </tr>
              </thead>
              <tbody>
                {claims.slice(0, 100).map((c) => (
                  <tr key={c.id} className="border-t border-hero-blue/10">
                    <td className="py-2 pr-3 text-slate-300">{c.item_name}</td>
                    <td className="py-2 pr-3 font-mono text-slate-400">
                      {c.status === 'pending' ? c.code : '••••••'}
                    </td>
                    <td className="py-2 pr-3 text-slate-400">{c.price_bits}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          c.status === 'fulfilled'
                            ? 'text-solana-green'
                            : c.status === 'pending'
                            ? 'text-hero-gold'
                            : 'text-slate-500'
                        }
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{shortDate(c.created_at)}</td>
                    <td className="py-2 text-slate-500">{shortDate(c.fulfilled_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
