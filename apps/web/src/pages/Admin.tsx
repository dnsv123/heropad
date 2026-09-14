import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '../lib/auth';

import { getJson, postJson } from '../services/apiClient';
import AdminBilling from '../components/AdminBilling';
import AdminPartners from '../components/AdminPartners';
import AdminRewards from '../components/AdminRewards';
import AdminOrders from '../components/AdminOrders';
import AdminGuide from '../components/AdminGuide';
import EmojiPick from '../components/EmojiPick';
import FolderTabs from '../components/FolderTabs';
import InfoTip from '../components/InfoTip';
import PlanPicker from '../components/PlanPicker';
import BrandEditor from '../components/BrandEditor';

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
  /** Emoji on the venue's passport-album tile (☕ when unset). */
  icon: string | null;
  /** Co-branding: logo data URL + accent hex, both optional. */
  logo: string | null;
  accent: string | null;
  tagline: string | null;
  active: boolean;
  claimed: boolean;
  setupCode: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  monthlyFee: number;
  billingStatus: string;
  paidSince: string | null;
  partnerCode: string | null;
  /** The package, and the addons that explain the fee. null = not set yet. */
  plan: string | null;
  addons: Array<{ key: string; label: string; price: number; qty: number; once?: boolean }>;
  staffSeats: number;
  staffActive: number;
  staffPending: number;
  lastStampAt: string | null;
  stats: { stamps: number; customers: number; rewards: number };
}

interface Overview {
  venues: number;
  customers: number;
  stamps: number;
  rewards: number;
  trophies: number;
}

interface VenueAnalytics {
  venue: { slug: string; name: string; stampsRequired: number };
  totals: {
    stamps: number;
    customers: number;
    rewards: number;
    trophies: number;
    repeatCustomers: number;
    stamps7d: number;
    stamps30d: number;
    bySource: { merchant: number; ntag: number };
  };
  daily: Array<{ day: string; stamps: number; customers: number }>;
  customers: Array<{
    code: string;
    stamps: number;
    visits: number;
    rewards: number;
    current: number;
    firstSeen: string;
    lastSeen: string;
  }>;
}

interface SupportSubject {
  code: string;
  email: string | null;
  privyId: string;
  wallet: string | null;
  accountCreated: string | null;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  counts: { stamps: number; rewards: number; bitsTransactions: number; claims: number };
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch {
    return '—';
  }
}

const PUBLIC_BASE =
  typeof window !== 'undefined' ? window.location.origin : 'https://heropad.supervictoruniverse.com';

export default function Admin() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [myPrivyId, setMyPrivyId] = useState<string | null>(null);
  const [allowlistSet, setAllowlistSet] = useState(true);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  /** Referral codes for the venue picker. Typing one by hand invites pasting
      the activation code instead, which looks equally code-shaped and fails. */
  const [partnerCodes, setPartnerCodes] = useState<Array<{ code: string; name: string }>>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<VenueAnalytics | null>(null);
  const [analyticsFor, setAnalyticsFor] = useState<string | null>(null);

  // Newsletter export (Substack)
  const [nlSegment, setNlSegment] = useState('all');

  // Support / GDPR desk
  const [supportCode, setSupportCode] = useState('');
  const [supportReason, setSupportReason] = useState('');
  const [subject, setSubject] = useState<SupportSubject | null>(null);
  const [eraseConfirm, setEraseConfirm] = useState('');

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
      const [v, o, p] = await Promise.all([
        getJson<{ ok: true; venues: VenueRow[] }>('/api/admin/venues', token),
        getJson<{ ok: true } & Overview>('/api/admin/overview', token),
        // Partner codes load with the page, NOT with the Partners tab: the
        // "Brought by" select needs them as options, and a select whose saved
        // value has no matching option silently renders the first one — which
        // made every attribution LOOK reset on each fresh session, even
        // though the database held it the whole time.
        getJson<{ ok: true; partners: Array<{ partner: { code: string; displayName: string } }> }>(
          '/api/admin/partners',
          token
        ),
      ]);
      setVenues(v.venues);
      setOverview(o);
      setPartnerCodes(p.partners.map((x) => ({ code: x.partner.code, name: x.partner.displayName })));
    } catch (err) {
      const e = err as {
        code?: string;
        message: string;
        details?: { yourPrivyId?: string | null; allowlistConfigured?: boolean };
      };
      if (e.code === 'not_admin') {
        setIsAdmin(false);
        setMyPrivyId(e.details?.yourPrivyId ?? null);
        setAllowlistSet(e.details?.allowlistConfigured ?? true);
      } else setNotice({ kind: 'err', text: e.message });
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

  /**
   * Billing + attribution for one venue. These three fields are the only
   * inputs to every partner commission figure, so they live on the venue and
   * are never retyped anywhere else.
   */
  async function saveBilling(v: VenueRow, patch: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      await postJson(`/api/admin/venues/${v.slug}`, patch, token ?? undefined);
      await load();
      setNotice({ kind: 'ok', text: `Saved billing for ${v.name}.` });
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

  async function lookupSubject() {
    setBusy(true);
    setNotice(null);
    setSubject(null);
    setEraseConfirm('');
    try {
      const token = await getAccessToken();
      const qs = supportReason.trim()
        ? `?reason=${encodeURIComponent(supportReason.trim())}`
        : '';
      const r = await getJson<{ ok: true } & SupportSubject>(
        `/api/admin/support/${supportCode.trim().toUpperCase()}${qs}`,
        token ?? undefined
      );
      setSubject(r);
    } catch (err) {
      setNotice({ kind: 'err', text: (err as { message: string }).message });
    } finally {
      setBusy(false);
    }
  }

  async function exportNewsletter() {
    setBusy(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const r = await getJson<{
        ok: true;
        segment: string;
        count: number;
        subscribers: Array<{ email: string }>;
      }>(
        `/api/admin/marketing/export?segment=${encodeURIComponent(nlSegment)}`,
        token ?? undefined
      );
      if (r.count === 0) {
        setNotice({ kind: 'ok', text: 'No consented subscribers in this segment yet.' });
        return;
      }
      // One email per line under a header — exactly what Substack's
      // "Import email list" accepts.
      const csv = ['email', ...r.subscribers.map((s) => s.email)].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `heropad-substack-${nlSegment.replace(':', '-')}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice({
        kind: 'ok',
        text: `${r.count} subscriber(s) exported — import the CSV in Substack, then send from there.`,
      });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as { message: string }).message });
    } finally {
      setBusy(false);
    }
  }

  async function exportSubject() {
    setBusy(true);
    try {
      const token = await getAccessToken();
      const r = await getJson<{ ok: true; export: unknown }>(
        `/api/admin/support/${supportCode.trim().toUpperCase()}/export`,
        token ?? undefined
      );
      // Download as a file the customer can be sent directly.
      const blob = new Blob([JSON.stringify(r.export, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `heropad-export-${supportCode.trim().toUpperCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice({ kind: 'ok', text: 'Export downloaded — send this file to the customer.' });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as { message: string }).message });
    } finally {
      setBusy(false);
    }
  }

  async function eraseSubject() {
    const code = supportCode.trim().toUpperCase();
    setBusy(true);
    try {
      const token = await getAccessToken();
      const r = await postJson<{ confirm: string }, { ok: true; reminder: string }>(
        `/api/admin/support/${code}/erase`,
        { confirm: code },
        token ?? undefined
      );
      setSubject(null);
      setEraseConfirm('');
      setNotice({ kind: 'ok', text: `Erased. ${r.reminder}` });
    } catch (err) {
      setNotice({ kind: 'err', text: (err as { message: string }).message });
    } finally {
      setBusy(false);
    }
  }

  async function openAnalytics(v: VenueRow) {
    if (analyticsFor === v.slug) {
      setAnalyticsFor(null);
      setAnalytics(null);
      return;
    }
    setBusy(true);
    setAnalyticsFor(v.slug);
    setAnalytics(null);
    try {
      const token = await getAccessToken();
      const r = await getJson<{ ok: true } & VenueAnalytics>(
        `/api/admin/venues/${v.slug}/analytics`,
        token ?? undefined
      );
      setAnalytics(r);
    } catch (err) {
      setNotice({ kind: 'err', text: (err as { message: string }).message });
      setAnalyticsFor(null);
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
      <section className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-sm text-slate-400">
          {allowlistSet
            ? 'This account is not on the admin allowlist.'
            : 'No admin allowlist is configured yet (ADMIN_PRIVY_IDS is empty).'}
        </p>

        {myPrivyId && (
          <div className="mt-6 rounded-2xl border border-hero-gold/30 bg-hero-gold/5 p-4 text-left">
            <p className="text-xs uppercase tracking-wider text-hero-gold">
              This account&rsquo;s ID
            </p>
            <code className="mt-2 block break-all rounded-lg bg-hero-deep/80 px-3 py-2 font-mono text-xs text-hero-cyan">
              {myPrivyId}
            </code>
            <button
              type="button"
              onClick={() => void copy(myPrivyId, 'did')}
              className="mt-3 rounded-full border border-hero-gold/40 px-4 py-1.5 text-xs text-hero-gold transition hover:bg-hero-gold/10"
            >
              {copied === 'did' ? 'Copied!' : 'Copy ID'}
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              To grant admin access: Railway → <b>@heropad/api</b> → Variables →{' '}
              <b>ADMIN_PRIVY_IDS</b> → paste this exact value (comma-separated for
              several admins) → wait for the redeploy → reload this page.
              <br />
              Logged in with the wrong account? Log out and sign in with the admin one.
            </p>
          </div>
        )}
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

      {/* Folders, not a scroll. Four unrelated jobs live on this page - the
          support desk, adding a cafe, paying partners, and running venues -
          and stacking them meant hunting for the one you came for. */}
      <FolderTabs
        initial="venues"
        tabs={[
          {
            key: 'venues',
            icon: '☕',
            label: 'Venues',
            badge: venues.length > 0 ? String(venues.length) : undefined,
            render: () => (
              <div>
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
                                {v.stats.rewards} rewards · 👥 {v.staffActive}/{v.staffSeats} team
                                {v.staffPending > 0 && (
                                  <span className="text-hero-gold"> ({v.staffPending} not activated)</span>
                                )}
                              </p>
                              {/* Adoption, not vanity: a venue with no activity for days is a
                                  venue about to churn, and it is the only signal that arrives
                                  before the cancellation email. */}
                              {v.claimed && v.staffActive === 0 && (
                                // Signed, but nobody works the counter yet.
                                // This is the adoption problem that looks fine
                                // in every other number on the card.
                                <p className="mt-2 rounded-lg border border-hero-gold/40 bg-hero-gold/10 px-3 py-1.5 text-[11px] text-hero-gold">
                                  ⚠ No team account activated — the owner has not set up any staff.
                                </p>
                              )}
                              <p className="mt-1 text-[11px]">
                                {(() => {
                                  if (!v.lastStampAt) {
                                    return <span className="text-slate-600">no activity yet</span>;
                                  }
                                  const days = Math.floor(
                                    (Date.now() - new Date(v.lastStampAt).getTime()) / 86400000
                                  );
                                  const tone =
                                    days <= 1 ? 'text-solana-green' : days <= 6 ? 'text-slate-400' : 'text-red-300';
                                  const label =
                                    days === 0 ? 'active today' : days === 1 ? 'active yesterday' : `quiet ${days} days`;
                                  return <span className={tone}>● {label}</span>;
                                })()}
                              </p>

                              {/* Identity details — editable after creation, because cafés
                                  move, rebrand, and pick their album emoji late. Owner-side
                                  settings (reward, threshold, happy hour) stay on /business. */}
                              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-hero-blue/15 bg-hero-deep/70 p-3">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">
                                  Name
                                  <input
                                    type="text"
                                    maxLength={80}
                                    defaultValue={v.name}
                                    onBlur={(e) => {
                                      const val = e.target.value.trim();
                                      if (val.length >= 2 && val !== v.name) void saveBilling(v, { name: val });
                                    }}
                                    className="mt-1 block w-44 rounded-lg border border-hero-blue/25 bg-hero-deep px-2 py-1 text-sm text-white"
                                  />
                                </label>
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">
                                  Address
                                  <input
                                    type="text"
                                    maxLength={200}
                                    defaultValue={v.address ?? ''}
                                    onBlur={(e) => {
                                      const val = e.target.value.trim();
                                      if (val !== (v.address ?? '')) void saveBilling(v, { address: val });
                                    }}
                                    className="mt-1 block w-64 rounded-lg border border-hero-blue/25 bg-hero-deep px-2 py-1 text-sm text-white"
                                  />
                                </label>
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">
                                  Emoji
                                  <InfoTip text="The icon on this venue's tile in the customer's SuperVictor Passport album (e.g. 🥐 for a bakery, 🍩 for donuts). Tap to pick from the palette; Clear returns the default ☕." />
                                  <EmojiPick
                                    value={v.icon}
                                    onPick={(icon) => {
                                      if (icon !== (v.icon ?? '')) void saveBilling(v, { icon });
                                    }}
                                  />
                                </label>
                              </div>

                              {/* The plan, as a button. Sets fee + seats + trial in one
                                  tap; the list underneath is what gets read out loud at
                                  the counter. The manual fee field below still works —
                                  it is the override, not the default. */}
                              <PlanPicker
                                currentPlan={v.plan}
                                currentAddons={v.addons ?? []}
                                currentFee={v.monthlyFee}
                                onApply={(patch) => saveBilling(v, patch)}
                              />

                              {/* Co-branding — what "Branded" physically delivers on the
                                  customer's card. Logo + one colour, previewed live. */}
                              <BrandEditor
                                venueName={v.name}
                                logo={v.logo}
                                accent={v.accent}
                                tagline={v.tagline}
                                onSave={(patch) => saveBilling(v, patch)}
                              />

                              {/* Billing + who brought this venue — the inputs to commission */}
                              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-hero-blue/15 bg-hero-deep/70 p-3">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">
                                  Fee / month
                                  <InfoTip text="What this café pays per month (RON). Feeds the partner commission math and the payout ledger." />
                                  <input
                                    type="number"
                                    min={0}
                                    defaultValue={v.monthlyFee}
                                    onBlur={(e) => {
                                      const n = Number(e.target.value);
                                      if (n !== v.monthlyFee) void saveBilling(v, { monthlyFee: n });
                                    }}
                                    className="mt-1 block w-24 rounded-lg border border-hero-blue/25 bg-hero-deep px-2 py-1 text-sm text-white"
                                  />
                                </label>
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">
                                  Billing
                                  <InfoTip text="trial = free pilot · active = paying (starts the 'paid since' date and partner commission) · paused/cancelled stop commission. Never blocks the café's counter." />
                                  <select
                                    value={v.billingStatus}
                                    onChange={(e) => void saveBilling(v, { billingStatus: e.target.value })}
                                    className="mt-1 block rounded-lg border border-hero-blue/25 bg-hero-deep px-2 py-1 text-sm text-white"
                                  >
                                    <option value="trial">trial (free)</option>
                                    <option value="active">active (paying)</option>
                                    <option value="paused">paused</option>
                                    <option value="cancelled">cancelled</option>
                                  </select>
                                </label>
                                <label className="text-[10px] uppercase tracking-wider text-slate-500">
                                  Brought by
                                  <InfoTip text="The referral partner who brought this café. Their commission is a share of this venue's monthly fee, counted only while billing is 'active'." />
                                  <select
                                    value={v.partnerCode ?? ''}
                                    onChange={(e) => void saveBilling(v, { partnerCode: e.target.value })}
                                    className="mt-1 block rounded-lg border border-hero-blue/25 bg-hero-deep px-2 py-1 text-sm text-white"
                                  >
                                    <option value="">nobody (direct)</option>
                                    {/* Safety net: the saved value always has an option,
                                        so it can never DISPLAY as reset. */}
                                    {v.partnerCode &&
                                      !partnerCodes.some((pc) => pc.code === v.partnerCode) && (
                                        <option value={v.partnerCode}>{v.partnerCode}</option>
                                      )}
                                    {partnerCodes.map((pc) => (
                                      <option key={pc.code} value={pc.code}>
                                        {pc.name} ({pc.code})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                {v.billingStatus === 'active' && v.paidSince && (
                                  <span className="pb-1 text-[10px] text-slate-600">since {v.paidSince}</span>
                                )}
                              </div>

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
                                <InfoTip text="The public page customers scan — this exact URL goes on the printed QR sticker. Opens this venue's loyalty card." />
                                <button
                                  type="button"
                                  onClick={() => void copy(businessUrl, `b-${v.slug}`)}
                                  className="rounded-full border border-hero-blue/40 px-3 py-1 text-slate-300 transition hover:border-hero-cyan hover:text-white"
                                >
                                  {copied === `b-${v.slug}` ? 'Copied!' : 'Copy merchant link'}
                                </button>
                                <InfoTip text="The counter app for this café (/business). Send it to the owner together with the setup code; activated staff use the same page." />
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void resetCode(v, false)}
                                  className="rounded-full border border-hero-gold/40 px-3 py-1 text-hero-gold transition hover:bg-hero-gold/10 disabled:opacity-40"
                                >
                                  New setup code
                                </button>
                                <InfoTip text="Issues a fresh one-time 8-character code the café types at /business to become the merchant. Any previous unused code stops working. Does nothing to an already-linked owner." />
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
                                {v.claimed && (
                                  <InfoTip text="Unlinks the current owner account and issues a new setup code — for when a café changes hands or the wrong account claimed it. Stamps, history and staff records stay." />
                                )}
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void toggleActive(v)}
                                  className="rounded-full border border-hero-blue/40 px-3 py-1 text-slate-300 transition hover:border-white hover:text-white disabled:opacity-40"
                                >
                                  {v.active ? 'Disable' : 'Enable'}
                                </button>
                                <InfoTip text="Disable hides the venue from customers and blocks stamps/redeems immediately. Nothing is deleted — already-visited customers keep it in their passport. Enable brings it back." />
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void openAnalytics(v)}
                                  className="rounded-full border border-hero-cyan/40 px-3 py-1 text-hero-cyan transition hover:bg-hero-cyan/10 disabled:opacity-40"
                                >
                                  {analyticsFor === v.slug ? 'Hide analytics' : '📊 Analytics'}
                                </button>
                                <InfoTip text="This venue's numbers: stamps 7/30 days, repeat rate, trophies, daily chart and per-customer progress — anonymous codes only, never emails." />
                              </div>

                              {/* ---- Per-venue deep dive ---- */}
                              {analyticsFor === v.slug && (
                                <div className="mt-4 border-t border-hero-blue/15 pt-4">
                                  {!analytics ? (
                                    <p className="text-sm text-slate-500">Loading…</p>
                                  ) : (
                                    <>
                                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                        {[
                                          { v: analytics.totals.stamps7d, l: 'Stamps · 7d' },
                                          { v: analytics.totals.stamps30d, l: 'Stamps · 30d' },
                                          {
                                            v:
                                              analytics.totals.customers > 0
                                                ? `${Math.round(
                                                    (analytics.totals.repeatCustomers /
                                                      analytics.totals.customers) *
                                                      100
                                                  )}%`
                                                : '—',
                                            l: 'Repeat rate',
                                          },
                                          { v: analytics.totals.trophies, l: 'Trophies' },
                                        ].map((t) => (
                                          <div
                                            key={t.l}
                                            className="rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3 text-center"
                                          >
                                            <p className="font-display text-xl font-bold text-hero-cyan">{t.v}</p>
                                            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                                              {t.l}
                                            </p>
                                          </div>
                                        ))}
                                      </div>

                                      {analytics.daily.length > 0 && (
                                        <div className="mt-3 rounded-xl border border-hero-blue/15 bg-hero-deep/60 p-3">
                                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                            Daily stamps ({analytics.daily.length} active days)
                                          </p>
                                          <div className="mt-2 flex h-16 items-end gap-1">
                                            {analytics.daily.slice(-30).map((d) => {
                                              const max = Math.max(...analytics.daily.map((x) => x.stamps));
                                              return (
                                                <div
                                                  key={d.day}
                                                  title={`${d.day}: ${d.stamps} stamps · ${d.customers} customers`}
                                                  className="flex-1 rounded-t bg-gradient-to-t from-hero-blue to-hero-cyan"
                                                  style={{ height: `${Math.max(8, (d.stamps / max) * 100)}%` }}
                                                />
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      <p className="mt-4 text-[10px] uppercase tracking-wider text-slate-500">
                                        Customers ({analytics.customers.length}) — by anonymous code
                                      </p>
                                      <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-hero-blue/15">
                                        <table className="w-full text-left text-xs">
                                          <thead className="sticky top-0 bg-hero-deep text-slate-500">
                                            <tr>
                                              <th className="px-3 py-2 font-medium">Code</th>
                                              <th className="px-2 py-2 font-medium">Stamps</th>
                                              <th className="px-2 py-2 font-medium">Visits</th>
                                              <th className="px-2 py-2 font-medium">Card</th>
                                              <th className="px-2 py-2 font-medium">🎁</th>
                                              <th className="px-2 py-2 font-medium">Last</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {analytics.customers.map((c) => (
                                              <tr key={c.code} className="border-t border-hero-blue/10">
                                                <td className="px-3 py-1.5 font-mono text-hero-cyan">{c.code}</td>
                                                <td className="px-2 py-1.5 text-slate-300">{c.stamps}</td>
                                                <td className="px-2 py-1.5 text-slate-300">{c.visits}</td>
                                                <td className="px-2 py-1.5 text-slate-400">
                                                  {Math.min(c.current, analytics.venue.stampsRequired)}/
                                                  {analytics.venue.stampsRequired}
                                                </td>
                                                <td className="px-2 py-1.5 text-solana-green">{c.rewards}</td>
                                                <td className="px-2 py-1.5 text-slate-500">
                                                  {shortDate(c.lastSeen)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                      <p className="mt-2 text-[10px] text-slate-600">
                                        Anonymous codes only — no emails or wallets, here or anywhere else.
                                        Stamps by source: {analytics.totals.bySource.merchant} counter ·{' '}
                                        {analytics.totals.bySource.ntag} figurine tap.
                                      </p>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {venues.length === 0 && (
                          <p className="text-sm text-slate-500">No venues yet — create the first one above.</p>
                        )}
                      </div>
              </div>
            ),
          },
          {
            key: 'new',
            icon: '➕',
            label: 'New venue',
            render: () => (
              <div>
                {/* ---- New venue ---- */}
                      <div className="mt-8 rounded-2xl border border-hero-gold/30 bg-hero-deep/50 p-5">
                        <h2 className="font-display text-lg font-semibold text-hero-gold">
                          ➕ New venue
                          <InfoTip text="Creates the café and its one-time setup code. Flow: create here → send the setup code + merchant link to the café → they enter it once at /business and become the merchant. GPS is optional and only powers the Map button." />
                        </h2>
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
              </div>
            ),
          },
          {
            key: 'partners',
            icon: '🤝',
            label: 'Partners',
            render: () => (
              <div>
                <AdminPartners
                        onNotice={(kind, text) => setNotice({ kind, text })}
                        onPartners={setPartnerCodes}
                      />
              </div>
            ),
          },
          {
            key: 'rewards',
            icon: '🎁',
            label: 'Rewards',
            render: () => (
              <AdminRewards onNotice={(kind, text) => setNotice({ kind, text })} />
            ),
          },
          {
            key: 'orders',
            icon: '📦',
            label: 'Orders',
            render: () => (
              <AdminOrders onNotice={(kind, text) => setNotice({ kind, text })} />
            ),
          },
          {
            key: 'billing',
            icon: '🧾',
            label: 'Billing',
            render: () => (
              <AdminBilling onNotice={(kind, text) => setNotice({ kind, text })} />
            ),
          },
          {
            key: 'newsletter',
            icon: '📣',
            label: 'Newsletter',
            render: () => (
              <div>
                {/* ---- Substack export ---- */}
                <div className="mt-8 rounded-2xl border border-hero-cyan/30 bg-hero-deep/50 p-5">
                  <h2 className="font-display text-lg font-semibold text-hero-cyan">
                    📣 Newsletter export (Substack)
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Downloads a CSV of <b>consented emails only</b> (opt-in with stored
                    timestamp + text version), sliced by segment. Import it in Substack
                    → Settings → Import email list, then write and send from there.
                    HeroPad never sends email itself. Every export is written to the
                    audit log (segment + count, never the addresses).
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={nlSegment}
                      onChange={(e) => setNlSegment(e.target.value)}
                      className="rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-hero-cyan focus:outline-none"
                    >
                      <option value="all">Everyone with consent</option>
                      <option value="trophies">Trophy holders (card + passport)</option>
                      <option value="inactive30">Inactive 30+ days ("we miss you")</option>
                      {venues.map((v) => (
                        <option key={v.slug} value={`venue:${v.slug}`}>
                          Customers of {v.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void exportNewsletter()}
                      className="rounded-full bg-hero-cyan px-5 py-2 text-sm font-semibold text-hero-deep transition hover:bg-white disabled:opacity-40"
                    >
                      ⬇ Export CSV
                    </button>
                    <a
                      href="https://supervictoruniverse.substack.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-500 underline transition hover:text-hero-cyan"
                    >
                      Open Substack ↗
                    </a>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'guide',
            icon: '📖',
            label: 'How-to',
            render: () => <AdminGuide />,
          },
          {
            key: 'support',
            icon: '🛟',
            label: 'Support / GDPR',
            render: () => (
              <div>
                {/* ---- Support / GDPR desk ---- */}
                      <div className="mt-8 rounded-2xl border border-solana-purple/30 bg-hero-deep/50 p-5">
                        <h2 className="font-display text-lg font-semibold text-solana-purple">
                          🔎 Support &amp; GDPR desk
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          Resolve a customer code to the real person — for support, data export
                          (Art. 20) or erasure (Art. 17). <b>Every lookup is written to the audit
                          log</b>, so keep the reason accurate.
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
                          <input
                            value={supportCode}
                            onChange={(e) => setSupportCode(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !busy && supportCode.trim().length === 6) {
                                void lookupSubject();
                              }
                            }}
                            maxLength={6}
                            placeholder="J7JBXR"
                            className="rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-center font-mono tracking-[0.2em] text-slate-100 focus:border-solana-purple focus:outline-none"
                          />
                          <input
                            value={supportReason}
                            onChange={(e) => setSupportReason(e.target.value)}
                            maxLength={120}
                            placeholder="Reason (e.g. customer asked for their data)"
                            className="rounded-lg border border-hero-blue/30 bg-hero-deep/80 px-3 py-2 text-sm text-slate-100 focus:border-solana-purple focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={busy || supportCode.trim().length !== 6}
                            onClick={() => void lookupSubject()}
                            className="rounded-full bg-solana-purple px-5 py-2 text-sm font-semibold text-white transition hover:bg-solana-purple-deep disabled:opacity-40"
                          >
                            Look up
                          </button>
                        </div>

                        {subject && (
                          <div className="mt-4 rounded-xl border border-hero-blue/20 bg-hero-deep/70 p-4">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <p className="text-sm">
                                <span className="text-slate-500">Email:</span>{' '}
                                <span className="text-slate-100">{subject.email ?? '— (not available)'}</span>
                              </p>
                              <p className="text-sm">
                                <span className="text-slate-500">Code:</span>{' '}
                                <span className="font-mono text-hero-cyan">{subject.code}</span>
                              </p>
                              <p className="text-xs text-slate-400">
                                Account created:{' '}
                                {subject.accountCreated ? shortDate(subject.accountCreated) : '—'}
                              </p>
                              <p className="text-xs text-slate-400">
                                Newsletter consent:{' '}
                                {subject.marketingConsent ? (
                                  <span className="text-solana-green">
                                    yes
                                    {subject.marketingConsentAt
                                      ? ` · ${shortDate(subject.marketingConsentAt)}`
                                      : ''}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">no</span>
                                )}
                              </p>
                            </div>
                            <p className="mt-2 text-xs text-slate-400">
                              ☕ {subject.counts.stamps} stamps · 🎁 {subject.counts.rewards} rewards · ⚡{' '}
                              {subject.counts.bitsTransactions} BITS entries · 🦸 {subject.counts.claims} claims
                            </p>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void exportSubject()}
                                className="rounded-full border border-hero-cyan/40 px-4 py-1.5 text-xs text-hero-cyan transition hover:bg-hero-cyan/10 disabled:opacity-40"
                              >
                                ⬇ Export data (JSON)
                              </button>
                              <InfoTip text="GDPR Art. 20: downloads everything we hold about this person as one JSON file — send it to them directly. The export itself is written to the audit log." />
                              <input
                                value={eraseConfirm}
                                onChange={(e) => setEraseConfirm(e.target.value.toUpperCase())}
                                maxLength={6}
                                placeholder="type code"
                                className="w-28 rounded-lg border border-red-400/40 bg-hero-deep/80 px-2 py-1.5 text-center font-mono text-xs text-red-200 focus:border-red-400 focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={busy || eraseConfirm !== subject.code}
                                onClick={() => void eraseSubject()}
                                className="rounded-full border border-red-400/50 px-4 py-1.5 text-xs text-red-300 transition hover:bg-red-400/10 disabled:opacity-30"
                              >
                                🗑 Erase all data
                              </button>
                              <InfoTip text="GDPR Art. 17, permanent: deletes stamps, rewards, BITS, claims and staff seats. Type the customer's 6-char code in the small box to arm the button. Afterwards also delete the user in the Privy dashboard." />
                            </div>
                            <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
                              Erasure removes stamps, rewards, BITS and claims permanently. Afterwards
                              also delete the user in the Privy dashboard (account email). On-chain
                              collectibles are public and cannot be deleted.
                            </p>
                          </div>
                        )}
                      </div>
              </div>
            ),
          },
        ]}
      />

    </section>
  );
}
