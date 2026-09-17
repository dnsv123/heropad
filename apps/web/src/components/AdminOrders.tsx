import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '../lib/auth';

import { getJson, postJson } from '../services/apiClient';
import InfoTip from './InfoTip';

// Admin → Orders. Physical pins, from us to the venues.
//
// The screen answers three questions, in this order:
//   1. What do I have to ship?            (open lots, top)
//   2. How many does each café have left? (derived stock grid)
//   3. What has each café bought?         (history)
//
// Stock is never typed in. It is lots shipped minus codes handed over at
// that counter, so the number here cannot drift from reality.

interface Item {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  active: boolean;
}
interface VenueRow {
  id: string;
  slug: string;
  name: string;
  billingStatus: string;
  active: boolean;
  starterSent: boolean;
  stock: Array<{ itemId: string; shipped: number; handedOver: number; left: number }>;
}
interface Order {
  id: string;
  venue_id: string;
  reward_id: string;
  qty: number;
  kind: 'starter' | 'purchase';
  unit_price: number;
  status: 'planned' | 'sent' | 'paid';
  note: string | null;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
}
interface Data {
  ok: true;
  defaults: { unitPrice: number; starterPerModel: number };
  items: Item[];
  venues: VenueRow[];
  orders: Order[];
}

const money = (n: number) => `${n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`;
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) : '—';

export default function AdminOrders({
  onNotice,
}: {
  onNotice: (kind: 'ok' | 'err', text: string) => void;
}) {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // New lot form
  const [fVenue, setFVenue] = useState('');
  const [fItem, setFItem] = useState('');
  const [fQty, setFQty] = useState('25');
  const [fPrice, setFPrice] = useState('');
  const [fNote, setFNote] = useState('');

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const r = await getJson<Data>('/api/admin/rewards/orders', token ?? undefined);
      setData(r);
      if (!fPrice) setFPrice(String(r.defaults.unitPrice));
    } catch (err) {
      onNotice('err', (err as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAccessToken, onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (key: string, path: string, body: unknown, okText?: string) => {
    setBusy(key);
    try {
      const token = await getAccessToken();
      await postJson(path, body, token ?? undefined);
      if (okText) onNotice('ok', okText);
      await load();
    } catch (err) {
      onNotice('err', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <p className="mt-8 text-sm text-slate-400">Loading orders…</p>;

  const itemById = new Map(data.items.map((i) => [i.id, i]));
  const venueById = new Map(data.venues.map((v) => [v.id, v]));
  const activeItems = data.items.filter((i) => i.active);
  const open = data.orders.filter((o) => o.status !== 'paid' && !(o.kind === 'starter' && o.status === 'sent'));
  const owed = data.orders
    .filter((o) => o.kind === 'purchase' && o.status === 'sent')
    .reduce((s, o) => s + o.qty * o.unit_price, 0);

  const input =
    'mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none';

  return (
    <div className="mt-8 space-y-6">
      {/* ---- 1. What do I have to do ---- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-hero-navy p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">To ship</p>
          <p className="mt-1 font-display text-2xl font-bold text-hero-gold">
            {data.orders.filter((o) => o.status === 'planned').length}
          </p>
          <p className="text-[11px] text-slate-500">lots planned, not sent</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-hero-navy p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">To collect</p>
          <p className="mt-1 font-display text-2xl font-bold text-hero-cyan">{money(owed)}</p>
          <p className="text-[11px] text-slate-500">sent, not yet paid</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-hero-navy p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Starter kits</p>
          <p className="mt-1 font-display text-2xl font-bold text-solana-green">
            {data.venues.filter((v) => v.starterSent).length}/{data.venues.filter((v) => v.active).length}
          </p>
          <p className="text-[11px] text-slate-500">venues that got theirs</p>
        </div>
      </div>

      {/* ---- The rule, once, where the decision is made ---- */}
      <div className="rounded-xl border border-hero-gold/25 bg-hero-gold/5 px-4 py-3 text-[11px] leading-relaxed text-slate-300">
        <b className="text-hero-gold">The deal, as you say it:</b> the first{' '}
        <b className="text-white">{data.defaults.starterPerModel * Math.max(activeItems.length, 1)} pins</b>{' '}
        ({data.defaults.starterPerModel} of each model) are on us — the starter kit. After that,
        packs of 25 per model at <b className="text-white">{money(data.defaults.unitPrice)}/pin</b>{' '}
        ({money(25 * data.defaults.unitPrice)} a pack). Theirs to give to whoever they want.
        <InfoTip text="Why they pay for round two: an owner who paid for pins promotes them; one who got them free forgets them in a drawer. The starter kit proves it works, the second pack proves they believe it." />
      </div>

      {/* ---- 2. Stock grid: venues × models ---- */}
      <div>
        <h3 className="font-display text-lg font-semibold text-white">Stock at each counter</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Shipped minus handed over. Red = time to offer a pack.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="py-2 pr-3 font-medium">Venue</th>
                {activeItems.map((i) => (
                  <th key={i.id} className="py-2 pr-3 font-medium">
                    {i.name}
                  </th>
                ))}
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.venues
                .filter((v) => v.active)
                .map((v) => (
                  <tr key={v.id} className="border-t border-white/[0.08]">
                    <td className="py-2 pr-3">
                      <span className="font-semibold text-slate-200">{v.name}</span>
                      <span className="ml-2 text-[10px] text-slate-500">{v.billingStatus}</span>
                    </td>
                    {activeItems.map((i) => {
                      const s = v.stock.find((x) => x.itemId === i.id);
                      const left = s?.left ?? 0;
                      return (
                        <td key={i.id} className="py-2 pr-3 font-mono">
                          <span
                            className={
                              left <= 0
                                ? 'text-red-300'
                                : left <= 3
                                ? 'text-hero-gold'
                                : 'text-solana-green'
                            }
                          >
                            {left}
                          </span>
                          <span className="text-slate-600"> / {s?.shipped ?? 0}</span>
                        </td>
                      );
                    })}
                    <td className="py-2">
                      {v.starterSent ? (
                        <span className="text-[10px] text-slate-500">starter ✓</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === `starter:${v.slug}` || activeItems.length === 0}
                          onClick={() =>
                            call(
                              `starter:${v.slug}`,
                              '/api/admin/rewards/orders/starter',
                              { venueSlug: v.slug },
                              `Starter kit planned for ${v.name} — mark each lot “sent” when it leaves.`
                            )
                          }
                          className="rounded-full border border-solana-green/40 px-2.5 py-0.5 text-[11px] text-solana-green hover:bg-solana-green/10 disabled:opacity-40"
                        >
                          + Starter kit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- New lot ---- */}
      <div className="rounded-2xl border border-hero-cyan/30 bg-hero-navy p-5">
        <h3 className="font-display text-lg font-semibold text-hero-cyan">➕ New pack</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-500">
            Venue
            <select value={fVenue} onChange={(e) => setFVenue(e.target.value)} className={input}>
              <option value="">—</option>
              {data.venues.filter((v) => v.active).map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Model
            <select value={fItem} onChange={(e) => setFItem(e.target.value)} className={input}>
              <option value="">—</option>
              {activeItems.map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Quantity
            <input type="number" min={1} value={fQty} onChange={(e) => setFQty(e.target.value)} className={input} />
          </label>
          <label className="text-xs text-slate-500">
            Price / pin (lei)
            <input type="number" min={0} step="0.5" value={fPrice} onChange={(e) => setFPrice(e.target.value)} className={input} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-3">
            Note
            <input value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="e.g. asked on WhatsApp, deliver Thursday" className={input} />
          </label>
          <div className="self-end">
            <button
              type="button"
              disabled={!fVenue || !fItem || busy === 'new'}
              onClick={() =>
                call(
                  'new',
                  '/api/admin/rewards/orders',
                  {
                    venueSlug: fVenue,
                    itemSlug: fItem,
                    qty: Number(fQty) || 25,
                    kind: 'purchase',
                    unitPrice: Number(fPrice) || data.defaults.unitPrice,
                    note: fNote.trim() || undefined,
                  },
                  'Pack planned. Mark it “sent” when it leaves, “paid” when the money lands.'
                ).then(() => setFNote(''))
              }
              className="w-full rounded-full bg-hero-cyan px-4 py-2 text-sm font-semibold text-hero-deep disabled:opacity-40"
            >
              {busy === 'new' ? '…' : `Add · ${money((Number(fQty) || 0) * (Number(fPrice) || 0))}`}
            </button>
          </div>
        </div>
      </div>

      {/* ---- 3. The lots ---- */}
      <div>
        <h3 className="font-display text-lg font-semibold text-white">
          Lots {open.length > 0 && <span className="text-hero-gold">· {open.length} open</span>}
        </h3>
        {data.orders.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">None yet. Send the first starter kit above.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-2 pr-3 font-medium">Venue</th>
                  <th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 font-medium">Qty</th>
                  <th className="py-2 pr-3 font-medium">Value</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => {
                  const value = o.qty * o.unit_price;
                  return (
                    <tr key={o.id} className="border-t border-white/[0.08]">
                      <td className="py-2 pr-3 text-slate-300">{venueById.get(o.venue_id)?.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-slate-300">
                        {itemById.get(o.reward_id)?.name ?? '—'}
                        {o.kind === 'starter' && (
                          <span className="ml-1.5 rounded-full border border-solana-green/40 px-1.5 text-[9px] uppercase text-solana-green">
                            free
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-300">{o.qty}</td>
                      <td className="py-2 pr-3 text-slate-400">{value > 0 ? money(value) : '—'}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            o.status === 'paid'
                              ? 'text-solana-green'
                              : o.status === 'sent'
                              ? 'text-hero-cyan'
                              : 'text-hero-gold'
                          }
                        >
                          {o.status}
                        </span>
                        {o.note && <span className="ml-2 text-[10px] text-slate-600">{o.note}</span>}
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{shortDate(o.created_at)}</td>
                      <td className="py-2">
                        <div className="flex gap-1.5">
                          {o.status === 'planned' && (
                            <button
                              type="button"
                              disabled={busy === o.id}
                              onClick={() => call(o.id, `/api/admin/rewards/orders/${o.id}/status`, { status: 'sent' })}
                              className="rounded-full border border-hero-cyan/40 px-2 py-0.5 text-[11px] text-hero-cyan hover:bg-hero-cyan/10"
                            >
                              Mark sent
                            </button>
                          )}
                          {o.status === 'sent' && o.kind === 'purchase' && (
                            <button
                              type="button"
                              disabled={busy === o.id}
                              onClick={() => call(o.id, `/api/admin/rewards/orders/${o.id}/status`, { status: 'paid' })}
                              className="rounded-full border border-solana-green/40 px-2 py-0.5 text-[11px] text-solana-green hover:bg-solana-green/10"
                            >
                              Mark paid
                            </button>
                          )}
                          {o.status !== 'planned' && (
                            <button
                              type="button"
                              disabled={busy === o.id}
                              onClick={() =>
                                call(o.id, `/api/admin/rewards/orders/${o.id}/status`, {
                                  status: o.status === 'paid' ? 'sent' : 'planned',
                                })
                              }
                              className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-slate-500 hover:text-slate-300"
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
