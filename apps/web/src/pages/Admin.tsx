import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

import { getJson, postJson } from '../services/apiClient';

// /admin — the operator console (Valentin only; access is an allowlist of
// Privy DIDs in ADMIN_PRIVY_IDS on the API).
//
// Replaces hand-written SQL: create a venue here, hand the café its one-time
// setup code, and they claim their merchant account themselves at /business.
// Deliberately English-only and utilitarian — it is never customer-facing.

interface VenueRow {
  slug: string;
  name: string;
  address: string | null;
  stampsRequired: number;
  reward: string | null;
  active: boolean;
  claimed: boolean;
  setupCode: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  stats: { stamps: number; customers: number; rewards: number };
}

interface Overview {
  venues: number;
  customers: number;
  stamps: number;
  rewards: number;
  trophies: number;
}

const PUBLIC_BASE =
  typeof window !== 'undefined' ? window.location.origin : 'https://heropad.supervictoruniverse.com';

export default function Admin() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // New-venue form
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [required, setRequired] = useState('10');
  const [reward, setReward] = useState('O cafea gratis');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      await getJson('/api/admin/me', token);
      setIsAdmin(true);
      const [v, o] = await Promise.all([
        getJson<{ ok: true; venues: VenueRow[] }>('/api/admin/venues', token),
        getJson<{ ok: true } & Overview>('/api/admin/overview', token),
      ]);
      setVenues(v.venues);
      setOverview(o);
    } catch (err) {
      const e = err as { code?: string; message: string };
      if (e.code === 'not_admin') setIsAdmin(false);
      else setNotice({ kind: 'err', text: e.message });
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (ready && authenticated) void load();
  }, [ready, authenticated, load]);

  async function createVenue() {
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const body: Record<string, unknown> = {
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        stampsRequired: Number(required) || 10,
        reward: reward.trim(),
      };
      if (address.trim()) body.address = address.trim();
      if (lat.trim() && lng.trim()) {
        body.gpsLat = Number(lat);
        body.gpsLng = Number(lng);
      }
      const r = await postJson<typeof body, { ok: true; slug: string; setupCode: string }>(
        '/api/admin/venues',
        body,
        token ?? undefined
      );
      setNotice({
        kind: 'ok',
        text: `Venue created. Setup code for the café: ${r.setupCode}`,
      });
      setSlug('');
      setName('');
      setAddress('');
      setLat('');
      setLng('');
      await load();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as { message: string }).message });
    } finally {
      setBusy(false);
    }
  }

  async function resetCode(v: VenueRow, detachOwner: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await postJson<{ detachOwner: boolean }, { ok: true; setupCode: string }>(
        `/api/admin/venues/${v.slug}/reset-setup-code`,
        { detachOwner },
        token ?? undefined
      );
      setNotice({ kind: 'ok', text: `New setup code for ${v.name}: ${r.setupCode}` });
      await load();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as { message: string }).message });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(v: VenueRow) {
    setBusy(true);
    try {
      const token = await getAccessToken();
      await postJson(`/api/admin/venues/${v.slug}`, { active: !v.active }, token ?? undefined);
      await load();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as { message: string }).message });
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  // ---- Gates ---------------------------------------------------------------

  if (!ready) return null;

  if (!authenticated) {
    return (
      <section className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">HeroPad Admin</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in with your admin account.</p>
        <button
          type="button"
          onClick={login}
          className="mt-5 rounded-full bg-solana-purple px-6 py-2.5 font-medium text-white shadow-hero-purple transition hover:bg-solana-purple-deep"
        >
          Login
        </button>
      </section>
    );
  }

  if (isAdmin === false) {
    return (
      <section className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-sm text-slate-400">
          This account is not on the admin allowlist.
        </p>
      </section>
    );
  }

  // ---- Panel ---------------------------------------------------------------

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <h1 className="font-display text-2xl font-bold md:text-3xl">HeroPad Admin</h1>

      {overview && (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { v: overview.venues, l: 'Venues' },
            { v: overview.customers, l: 'Customers' },
            { v: overview.stamps, l: 'Stamps' },
            { v: overview.rewards, l: 'Rewards' },
            { v: overview.trophies, l: 'Trophies' },
          ].map((t) => (
            <div
              key={t.l}
              className="rounded-xl border border-hero-blue/20 bg-hero-deep/60 p-3 text-center"
            >
              <p className="font-display text-2xl font-bold text-hero-cyan">{t.v}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{t.l}</p>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <p
          className={`mt-4 rounded-xl border p-3 text-sm ${
            notice.kind === 'ok'
              ? 'border-solana-green/30 bg-solana-green/10 text-solana-green'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}
        >
          {notice.text}
        </p>
      )}

      {/* ---- New venue ---- */}
      <div className="mt-8 rounded-2xl border border-hero-gold/30 bg-hero-deep/50 p-5">
        <h2 className="font-display text-lg font-semibold text-hero-gold">➕ New venue</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            Slug (URL: /loyalty/<b>slug</b>) — lowercase, dashes
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="cafe-146"
              className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
            />
          </label>
          <label className="text-xs text-slate-500">
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="146 Specialty Coffee"
              className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
            />
          </label>
          <label className="text-xs text-slate-500">
            Address (optional)
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Str. Ocnei 18, Sibiu"
              className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              Stamps
              <input
                type="number"
                min={3}
                max={30}
                value={required}
                onChange={(e) => setRequired(e.target.value)}
                className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
              />
            </label>
            <label className="text-xs text-slate-500">
              Reward
              <input
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
              />
            </label>
          </div>
          <label className="text-xs text-slate-500">
            GPS latitude (for the customer Map button)
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="45.7983"
              className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
            />
          </label>
          <label className="text-xs text-slate-500">
            GPS longitude
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="24.1256"
              className="mt-1 w-full rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          GPS tip: open Google Maps, right-click the café → the first entry copies
          “45.7983, 24.1256”.
        </p>
        <button
          type="button"
          disabled={busy || slug.trim().length < 2 || name.trim().length < 2}
          onClick={() => void createVenue()}
          className="mt-3 w-full rounded-full bg-hero-gold px-4 py-2.5 font-semibold text-hero-deep shadow-hero-gold transition hover:bg-hero-gold-bright disabled:opacity-50"
        >
          Create venue + setup code
        </button>
      </div>

      {/* ---- Venue list ---- */}
      <h2 className="mt-8 font-display text-lg font-semibold text-white">Venues</h2>
      <div className="mt-3 space-y-3">
        {venues.map((v) => {
          const customerUrl = `${PUBLIC_BASE}/loyalty/${v.slug}`;
          const businessUrl = `${PUBLIC_BASE}/business?venue=${v.slug}`;
          return (
            <div
              key={v.slug}
              className="rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-display font-semibold text-white">
                    {v.name}{' '}
                    <span className="font-mono text-xs text-slate-500">/{v.slug}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {v.address ?? '—'} · {v.stampsRequired} stamps → {v.reward ?? 'reward'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span
                    className={`rounded-full border px-2 py-0.5 ${
                      v.claimed
                        ? 'border-solana-green/40 text-solana-green'
                        : 'border-hero-gold/40 text-hero-gold'
                    }`}
                  >
                    {v.claimed ? 'merchant linked' : 'awaiting setup'}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 ${
                      v.active ? 'border-hero-cyan/40 text-hero-cyan' : 'border-red-400/40 text-red-300'
                    }`}
                  >
                    {v.active ? 'active' : 'disabled'}
                  </span>
                </div>
              </div>

              <p className="mt-2 text-xs text-slate-400">
                ☕ {v.stats.stamps} stamps · 👤 {v.stats.customers} customers · 🎁{' '}
                {v.stats.rewards} rewards
              </p>

              {v.setupCode && (
                <p className="mt-2 rounded-lg border border-hero-gold/40 bg-hero-gold/10 px-3 py-2 text-sm text-hero-gold">
                  Setup code: <b className="font-mono tracking-widest">{v.setupCode}</b> — the
                  café enters this once at /business
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => void copy(customerUrl, `c-${v.slug}`)}
                  className="rounded-full border border-hero-blue/40 px-3 py-1 text-slate-300 transition hover:border-hero-cyan hover:text-white"
                >
                  {copied === `c-${v.slug}` ? 'Copied!' : 'Copy customer link (QR)'}
                </button>
                <button
                  type="button"
                  onClick={() => void copy(businessUrl, `b-${v.slug}`)}
                  className="rounded-full border border-hero-blue/40 px-3 py-1 text-slate-300 transition hover:border-hero-cyan hover:text-white"
                >
                  {copied === `b-${v.slug}` ? 'Copied!' : 'Copy merchant link'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void resetCode(v, false)}
                  className="rounded-full border border-hero-gold/40 px-3 py-1 text-hero-gold transition hover:bg-hero-gold/10 disabled:opacity-40"
                >
                  New setup code
                </button>
                {v.claimed && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resetCode(v, true)}
                    className="rounded-full border border-red-400/40 px-3 py-1 text-red-300 transition hover:bg-red-400/10 disabled:opacity-40"
                  >
                    Detach merchant
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleActive(v)}
                  className="rounded-full border border-hero-blue/40 px-3 py-1 text-slate-300 transition hover:border-white hover:text-white disabled:opacity-40"
                >
                  {v.active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          );
        })}
        {venues.length === 0 && (
          <p className="text-sm text-slate-500">No venues yet — create the first one above.</p>
        )}
      </div>
    </section>
  );
}
