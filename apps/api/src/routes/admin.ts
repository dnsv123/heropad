import { createHash, randomInt } from 'node:crypto';

import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import {
  requireAuth,
  getPrivyUserContact,
  getUserSolanaWallets,
  type AuthedRequest,
} from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { queryString } from '../lib/query.js';
import { ensureIdentity, getVenueBySlug, findIdentityByCode } from '../lib/loyalty-db.js';
import {
  createPartner,
  getPartnerByCode,
  getPartnersOverview,
  resetPartnerClaimToken,
  markPayoutPaid,
  suggestPartnerCode,
  updatePartner,
  upsertPayout,
} from '../lib/partners-db.js';
import { billingAdminRouter } from './billing.js';
import { rewardsAdminRouter } from './rewards.js';

// Admin routes — the operator's control panel (Valentin only).
// ---------------------------------------------------------------------------
// Access is an explicit allowlist of Privy DIDs in ADMIN_PRIVY_IDS. If the env
// var is empty NOBODY is admin: the panel fails closed, so a misconfiguration
// can never hand control to a random logged-in user.
//
// The flow this replaces: hand-written SQL in Supabase + an env flag on
// Railway. Now: create the venue here, hand the café its one-time setup code,
// and they claim the merchant account themselves at /business.

export const adminRouter = Router();

adminRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ ok: false, error: 'rate_limited', message: 'Slow down.' }),
  })
);

function adminIds(): string[] {
  return (process.env.ADMIN_PRIVY_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Gate every admin route on the allowlist. Fails closed when unset. */
function requireAdmin(req: Request, res: Response, next: () => void): void {
  const privyId = (req as AuthedRequest).privyId;
  const allowed = adminIds();
  if (!privyId || allowed.length === 0 || !allowed.includes(privyId)) {
    res.status(403).json({
      ok: false,
      error: 'not_admin',
      message: 'This account does not have admin access.',
      // Echo the caller's OWN id so the operator can copy it straight into
      // ADMIN_PRIVY_IDS. Safe: you only ever learn your own identifier.
      yourPrivyId: privyId ?? null,
      allowlistConfigured: allowed.length > 0,
    });
    return;
  }
  next();
}

adminRouter.use(requireAuth, requireAdmin);

// Invoicing lives in its own file but behind the same allowlist — mounted
// here rather than in index.ts so it can never accidentally be exposed
// without the admin gate.
adminRouter.use('/billing', billingAdminRouter);
adminRouter.use('/rewards', rewardsAdminRouter);

function serverError(res: Response, scope: string, err: unknown): void {
  console.error(`[admin.${scope}]`, (err as Error).message);
  res.status(500).json({ ok: false, error: 'server_error', message: 'Something went wrong.' });
}

// Unambiguous alphabet, same rationale as loyalty codes (no 0/O, 1/I/L).
const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function setupCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  return out;
}

// GET /api/admin/me — is the caller an admin? (drives the UI gate)
adminRouter.get('/me', (req: Request, res: Response) => {
  res.status(200).json({ ok: true, privyId: (req as AuthedRequest).privyId, admin: true });
});

// GET /api/admin/venues — every venue + live counters, newest first.
adminRouter.get('/venues', async (_req: Request, res: Response) => {
  try {
    const supa = getSupabaseAdmin();
    const { data: venues, error } = await supa
      .from('venues')
      .select(
        'id, slug, name, address, stamps_required, branding, active, owner_identity_id, claim_token, gps_lat, gps_lng, monthly_fee, billing_status, paid_since, referred_by, staff_seats, created_at'
      )
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (venues ?? []) as Array<{
      id: string;
      slug: string;
      name: string;
      address: string | null;
      stamps_required: number;
      branding: Record<string, unknown> | null;
      active: boolean;
      owner_identity_id: string | null;
      claim_token: string | null;
      gps_lat: number | null;
      gps_lng: number | null;
      monthly_fee: number | string | null;
      billing_status: string | null;
      paid_since: string | null;
      referred_by: string | null;
      staff_seats: number | null;
      created_at: string;
    }>;

    // Referral attribution, resolved to the partner code the operator types.
    const partnerCodeById = new Map<string, string>();
    {
      const ids = [...new Set(rows.map((r) => r.referred_by).filter(Boolean))] as string[];
      if (ids.length > 0) {
        // Never swallowed: a failed join here would render every attribution
        // as "nobody", which reads as data loss when it is only a bad read.
        const { data: ps, error: pErr } = await supa
          .from('partners')
          .select('id, code')
          .in('id', ids);
        if (pErr) throw new Error(pErr.message);
        for (const p of (ps ?? []) as Array<{ id: string; code: string }>) {
          partnerCodeById.set(p.id, p.code);
        }
      }
    }

    // Per-venue activity — small volumes at pilot scale, counted in one pass.
    const [{ data: stamps }, { data: rewards }, { data: staffRows }] = await Promise.all([
      supa.from('stamps').select('venue_id, user_identity_id, created_at'),
      supa.from('rewards_redeemed').select('venue_id'),
      supa.from('venue_staff').select('venue_id, active, identity_id'),
    ]);

    // How many team seats each venue actually uses, and how many are still
    // waiting on their code — the two numbers that say whether a café has
    // really adopted the tool or just signed for it.
    const staffBy = new Map<string, { active: number; pending: number }>();
    for (const st of (staffRows ?? []) as Array<{
      venue_id: string;
      active: boolean;
      identity_id: string | null;
    }>) {
      const cur = staffBy.get(st.venue_id) ?? { active: 0, pending: 0 };
      if (st.active) cur.active += 1;
      if (!st.identity_id) cur.pending += 1;
      staffBy.set(st.venue_id, cur);
    }
    const lastStampBy = new Map<string, string>();
    const stampsBy = new Map<string, number>();
    const customersBy = new Map<string, Set<string>>();
    for (const s of (stamps ?? []) as Array<{
      venue_id: string;
      user_identity_id: string;
      created_at: string;
    }>) {
      stampsBy.set(s.venue_id, (stampsBy.get(s.venue_id) ?? 0) + 1);
      if (!customersBy.has(s.venue_id)) customersBy.set(s.venue_id, new Set());
      customersBy.get(s.venue_id)!.add(s.user_identity_id);
      const prev = lastStampBy.get(s.venue_id);
      if (!prev || s.created_at > prev) lastStampBy.set(s.venue_id, s.created_at);
    }
    const rewardsBy = new Map<string, number>();
    for (const r of (rewards ?? []) as Array<{ venue_id: string }>) {
      rewardsBy.set(r.venue_id, (rewardsBy.get(r.venue_id) ?? 0) + 1);
    }

    return res.status(200).json({
      ok: true,
      venues: rows.map((v) => ({
        slug: v.slug,
        name: v.name,
        address: v.address,
        stampsRequired: v.stamps_required,
        reward: typeof v.branding?.reward === 'string' ? v.branding.reward : null,
        icon: typeof v.branding?.icon === 'string' ? v.branding.icon : null,
        active: v.active,
        claimed: Boolean(v.owner_identity_id),
        setupCode: v.claim_token,
        gpsLat: v.gps_lat,
        gpsLng: v.gps_lng,
        monthlyFee: Number(v.monthly_fee ?? 0),
        billingStatus: v.billing_status ?? 'trial',
        paidSince: v.paid_since,
        partnerCode: v.referred_by ? (partnerCodeById.get(v.referred_by) ?? null) : null,
        createdAt: v.created_at,
        staffSeats: Number(v.staff_seats ?? 2),
        staffActive: staffBy.get(v.id)?.active ?? 0,
        staffPending: staffBy.get(v.id)?.pending ?? 0,
        lastStampAt: lastStampBy.get(v.id) ?? null,
        stats: {
          stamps: stampsBy.get(v.id) ?? 0,
          customers: customersBy.get(v.id)?.size ?? 0,
          rewards: rewardsBy.get(v.id) ?? 0,
        },
      })),
    });
  } catch (err) {
    return serverError(res, 'venues', err);
  }
});

const CreateBody = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'Slug: lowercase letters, digits, dashes'),
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200).optional(),
  stampsRequired: z.number().int().min(3).max(30).default(10),
  reward: z.string().trim().min(2).max(60).default('O cafea gratis'),
  gpsLat: z.number().min(-90).max(90).nullable().optional(),
  gpsLng: z.number().min(-180).max(180).nullable().optional(),
});

// POST /api/admin/venues — create a venue and its one-time setup code.
adminRouter.post('/venues', async (req: Request, res: Response) => {
  try {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    const input = parsed.data;
    if (await getVenueBySlug(input.slug)) {
      return res.status(409).json({
        ok: false,
        error: 'slug_taken',
        message: 'A venue with this slug already exists.',
      });
    }

    const code = setupCode();
    const { error } = await getSupabaseAdmin()
      .from('venues')
      .insert({
        slug: input.slug,
        name: input.name,
        address: input.address ?? null,
        stamps_required: input.stampsRequired,
        branding: { reward: input.reward },
        gps_lat: input.gpsLat ?? null,
        gps_lng: input.gpsLng ?? null,
        claim_token: code,
        claim_expires_at: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
        active: true,
      });
    if (error) throw new Error(error.message);

    return res.status(201).json({ ok: true, slug: input.slug, setupCode: code });
  } catch (err) {
    return serverError(res, 'create', err);
  }
});

const UpdateBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  address: z.string().trim().max(200).optional(),
  stampsRequired: z.number().int().min(3).max(30).optional(),
  reward: z.string().trim().min(2).max(60).optional(),
  /** Emoji shown on this venue's passport-album tile; '' clears it (☕ default). */
  icon: z.string().trim().max(8).optional(),
  gpsLat: z.number().min(-90).max(90).nullable().optional(),
  gpsLng: z.number().min(-180).max(180).nullable().optional(),
  active: z.boolean().optional(),
  // Billing + attribution. A partner's commission is a percentage OF these,
  // so they live on the venue rather than being retyped every month.
  monthlyFee: z.number().min(0).max(100000).optional(),
  billingStatus: z.enum(['trial', 'active', 'paused', 'cancelled']).optional(),
  paidSince: z.string().trim().max(20).nullable().optional(),
  /** Referral code of the partner who brought this venue; '' clears it. */
  partnerCode: z.string().trim().max(40).nullable().optional(),
});

// POST /api/admin/venues/:slug — edit venue details (incl. GPS for the map).
adminRouter.post('/venues/:slug', async (req: Request, res: Response) => {
  try {
    const venue = await getVenueBySlug(req.params.slug);
    if (!venue) {
      return res.status(404).json({ ok: false, error: 'unknown_venue', message: 'No such venue.' });
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const i = parsed.data;
    const patch: Record<string, unknown> = {};
    if (i.name !== undefined) patch.name = i.name;
    if (i.address !== undefined) patch.address = i.address;
    if (i.stampsRequired !== undefined) patch.stamps_required = i.stampsRequired;
    if (i.gpsLat !== undefined) patch.gps_lat = i.gpsLat;
    if (i.gpsLng !== undefined) patch.gps_lng = i.gpsLng;
    if (i.active !== undefined) patch.active = i.active;
    if (i.reward !== undefined || i.icon !== undefined) {
      const branding = { ...(venue.branding ?? {}) };
      if (i.reward !== undefined) branding.reward = i.reward;
      if (i.icon !== undefined) {
        if (i.icon === '') delete branding.icon;
        else branding.icon = i.icon;
      }
      patch.branding = branding;
    }
    if (i.monthlyFee !== undefined) patch.monthly_fee = i.monthlyFee;
    if (i.billingStatus !== undefined) {
      patch.billing_status = i.billingStatus;
      // Stamp the start of billing the first time it goes active, so the
      // clawback window has a date without anyone remembering to set one.
      if (i.billingStatus === 'active' && !venue.paid_since && i.paidSince === undefined) {
        patch.paid_since = new Date().toISOString().slice(0, 10);
      }
    }
    if (i.paidSince !== undefined) patch.paid_since = i.paidSince || null;
    if (i.partnerCode !== undefined) {
      if (!i.partnerCode) {
        patch.referred_by = null;
      } else {
        const partner = await getPartnerByCode(i.partnerCode.toUpperCase());
        if (!partner) {
          return res.status(404).json({
            ok: false,
            error: 'unknown_partner',
            message: `No partner with code ${i.partnerCode}.`,
          });
        }
        patch.referred_by = partner.id;
      }
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'nothing', message: 'Nothing to update.' });
    }

    const { error } = await getSupabaseAdmin().from('venues').update(patch).eq('id', venue.id);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, 'update', err);
  }
});

// POST /api/admin/venues/:slug/reset-setup-code — new code, and (optionally)
// detach the current merchant so the venue can be handed to someone else.
adminRouter.post('/venues/:slug/reset-setup-code', async (req: Request, res: Response) => {
  try {
    const venue = await getVenueBySlug(req.params.slug);
    if (!venue) {
      return res.status(404).json({ ok: false, error: 'unknown_venue', message: 'No such venue.' });
    }
    const detach = req.body?.detachOwner === true;
    const code = setupCode();
    const patch: Record<string, unknown> = {
      claim_token: code,
      claim_expires_at: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
    };
    if (detach) patch.owner_identity_id = null;

    const { error } = await getSupabaseAdmin().from('venues').update(patch).eq('id', venue.id);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, setupCode: code, detached: detach });
  } catch (err) {
    return serverError(res, 'reset-code', err);
  }
});

// GET /api/admin/overview — platform totals for the dashboard header.
adminRouter.get('/overview', async (_req: Request, res: Response) => {
  try {
    const supa = getSupabaseAdmin();
    const [venues, identities, stamps, rewards, trophies] = await Promise.all([
      supa.from('venues').select('id', { count: 'exact', head: true }),
      supa.from('user_identity').select('id', { count: 'exact', head: true }),
      supa.from('stamps').select('id', { count: 'exact', head: true }),
      supa.from('rewards_redeemed').select('id', { count: 'exact', head: true }),
      supa
        .from('rewards_redeemed')
        .select('id', { count: 'exact', head: true })
        .not('trophy_asset_id', 'is', null),
    ]);
    return res.status(200).json({
      ok: true,
      venues: venues.count ?? 0,
      customers: identities.count ?? 0,
      stamps: stamps.count ?? 0,
      rewards: rewards.count ?? 0,
      trophies: trophies.count ?? 0,
    });
  } catch (err) {
    return serverError(res, 'overview', err);
  }
});

// GET /api/admin/venues/:slug/analytics — the operator's deep-dive for one
// venue: growth over time, retention, and the customer roster BY ANONYMOUS
// CODE. Deliberately no emails/wallets: the operator answers support with the
// code the customer reads off their own screen.
adminRouter.get('/venues/:slug/analytics', async (req: Request, res: Response) => {
  try {
    const venue = await getVenueBySlug(req.params.slug);
    if (!venue) {
      return res.status(404).json({ ok: false, error: 'unknown_venue', message: 'No such venue.' });
    }
    const supa = getSupabaseAdmin();
    const [{ data: stampRows, error: sErr }, { data: rewardRows, error: rErr }] =
      await Promise.all([
        supa
          .from('stamps')
          .select('user_identity_id, stamp_day, created_at, source')
          .eq('venue_id', venue.id),
        supa
          .from('rewards_redeemed')
          .select('user_identity_id, redeemed_at, trophy_asset_id, reward_type, stamps_consumed')
          .eq('venue_id', venue.id),
      ]);
    if (sErr) throw new Error(sErr.message);
    if (rErr) throw new Error(rErr.message);

    const stamps = (stampRows ?? []) as Array<{
      user_identity_id: string;
      stamp_day: string;
      created_at: string;
      source: string;
    }>;
    const rewards = (rewardRows ?? []) as Array<{
      user_identity_id: string;
      redeemed_at: string;
      trophy_asset_id: string | null;
      reward_type: string | null;
      stamps_consumed: number;
    }>;

    // Per-customer rollup (keyed by identity id, surfaced as loyalty_code).
    interface Agg {
      stamps: number;
      days: Set<string>;
      first: string;
      last: string;
      rewards: number;
      consumed: number;
    }
    const byCustomer = new Map<string, Agg>();
    for (const s of stamps) {
      const a = byCustomer.get(s.user_identity_id) ?? {
        stamps: 0,
        days: new Set<string>(),
        first: s.created_at,
        last: s.created_at,
        rewards: 0,
        consumed: 0,
      };
      a.stamps += 1;
      a.days.add(s.stamp_day);
      if (s.created_at < a.first) a.first = s.created_at;
      if (s.created_at > a.last) a.last = s.created_at;
      byCustomer.set(s.user_identity_id, a);
    }
    for (const r of rewards) {
      const a = byCustomer.get(r.user_identity_id);
      if (!a) continue;
      a.rewards += 1;
      a.consumed += Number(r.stamps_consumed ?? 0);
    }

    // Resolve identity ids → anonymous loyalty codes (never emails).
    const ids = [...byCustomer.keys()];
    const codeById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: idents, error: iErr } = await supa
        .from('user_identity')
        .select('id, loyalty_code')
        .in('id', ids);
      if (iErr) throw new Error(iErr.message);
      for (const row of (idents ?? []) as Array<{ id: string; loyalty_code: string | null }>) {
        codeById.set(row.id, row.loyalty_code ?? '—');
      }
    }

    const customers = [...byCustomer.entries()]
      .map(([id, a]) => ({
        code: codeById.get(id) ?? '—',
        stamps: a.stamps,
        visits: a.days.size,
        rewards: a.rewards,
        current: Math.max(0, a.stamps - a.consumed),
        firstSeen: a.first,
        lastSeen: a.last,
      }))
      .sort((x, y) => y.stamps - x.stamps);

    // Daily series (all active days, oldest→newest).
    const byDay = new Map<string, { stamps: number; customers: Set<string> }>();
    for (const s of stamps) {
      if (!byDay.has(s.stamp_day)) {
        byDay.set(s.stamp_day, { stamps: 0, customers: new Set() });
      }
      const d = byDay.get(s.stamp_day)!;
      d.stamps += 1;
      d.customers.add(s.user_identity_id);
    }
    const daily = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, d]) => ({ day, stamps: d.stamps, customers: d.customers.size }));

    const now = Date.now();
    const since = (days: number) =>
      stamps.filter((s) => now - new Date(s.created_at).getTime() < days * 864e5).length;

    return res.status(200).json({
      ok: true,
      venue: { slug: venue.slug, name: venue.name, stampsRequired: venue.stamps_required },
      totals: {
        stamps: stamps.length,
        customers: byCustomer.size,
        rewards: rewards.length,
        trophies: rewards.filter((r) => r.trophy_asset_id).length,
        repeatCustomers: [...byCustomer.values()].filter((a) => a.days.size >= 2).length,
        stamps7d: since(7),
        stamps30d: since(30),
        bySource: {
          merchant: stamps.filter((s) => s.source === 'merchant').length,
          ntag: stamps.filter((s) => s.source === 'ntag_tap').length,
        },
      },
      daily,
      customers,
    });
  } catch (err) {
    return serverError(res, 'venue-analytics', err);
  }
});

// --- GDPR / support -----------------------------------------------------------

/** Writes an audit entry. Never throws into the request path. */
async function audit(
  adminPrivyId: string,
  action: string,
  subjectCode: string | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  try {
    await getSupabaseAdmin().from('admin_audit_log').insert({
      admin_privy_id: adminPrivyId,
      action,
      subject_code: subjectCode,
      detail,
    });
  } catch (err) {
    console.error('[admin.audit] failed:', (err as Error).message);
  }
}

/** Everything we hold about one identity, for export or review. */
/**
 * Every Solana address belonging to this person.
 *
 * `user_identity.solana_wallet` is a cache, filled only when the loyalty page
 * happens to send a wallet hint and the Privy lookup happens to succeed. A
 * figurine claimed at an event writes rows keyed purely by wallet address with
 * no identity link at all, so an erasure trusting that cached column reported
 * "0 claims deleted" and left the address, device id and claim history in
 * place forever. Ask Privy, then union.
 */
async function allWalletsFor(identity: {
  privy_id: string;
  solana_wallet: string | null;
}): Promise<string[]> {
  const set = new Set<string>();
  if (identity.solana_wallet) set.add(identity.solana_wallet);
  try {
    for (const w of await getUserSolanaWallets(identity.privy_id)) set.add(w);
  } catch {
    // Privy unreachable: proceed with what we have rather than refusing to
    // erase anything. The response reports how many wallets were covered.
  }
  return [...set];
}

async function collectSubjectData(identityId: string, wallets: string[]) {
  const supa = getSupabaseAdmin();
  const hasWallet = wallets.length > 0;
  const [stamps, rewards, codes, bits, claims, staff, partner, consent, passport] = await Promise.all([
    supa
      .from('stamps')
      .select('venue_id, source, created_at')
      .eq('user_identity_id', identityId),
    supa
      .from('rewards_redeemed')
      .select('venue_id, reward_type, stamps_consumed, trophy_asset_id, redeemed_at')
      .eq('user_identity_id', identityId),
    supa
      .from('redeem_codes')
      .select('venue_id, created_at, used_at')
      .eq('user_identity_id', identityId),
    hasWallet
      ? supa
          // metadata included: it holds which venue each stamp credit came
          // from and which trophy each award minted — subject data that an
          // Art. 20 export owes the person.
          .from('bits_transactions')
          .select('amount, reason, metadata, created_at')
          .in('wallet_address', wallets)
      : Promise.resolve({ data: [] as unknown[] }),
    hasWallet
      ? supa
          .from('claims')
          .select('code, cnft_mint_address, claimed_at')
          .in('wallet_address', wallets)
      : Promise.resolve({ data: [] as unknown[] }),
    // Added since this function was written, and just as personal.
    supa
      .from('venue_staff')
      .select('venue_id, display_name, role, active, created_at')
      .eq('identity_id', identityId),
    supa
      .from('partners')
      .select('code, display_name, city, email, commission_pct, created_at')
      .eq('identity_id', identityId),
    supa
      .from('user_identity')
      .select(
        'marketing_consent, marketing_consent_at, marketing_consent_version, marketing_email, birthday_day, birthday_month, birthday_set_at, referred_at, referral_rewarded_at'
      )
      .eq('id', identityId)
      .maybeSingle(),
    supa
      .from('passport_awards')
      .select('tier, venue_count, bits_awarded, trophy_asset_id, created_at')
      .eq('user_identity_id', identityId),
  ]);
  return {
    stamps: stamps.data ?? [],
    rewards: rewards.data ?? [],
    redeemCodes: codes.data ?? [],
    bitsTransactions: bits.data ?? [],
    claims: claims.data ?? [],
    staffSeats: staff.data ?? [],
    partnerRecord: partner.data ?? [],
    marketingConsent: consent.data ?? null,
    passportAwards: passport.data ?? [],
    walletsCovered: wallets,
  };
}

const CodeParam = /^[A-Z2-9]{6}$/i;

// GET /api/admin/support/:code — resolve a loyalty code to the real person.
// EVERY call is written to admin_audit_log: this is the one place where the
// operator crosses from anonymous codes into personal data.
adminRouter.get('/support/:code', async (req: Request, res: Response) => {
  try {
    const adminId = (req as AuthedRequest).privyId as string;
    const code = String(req.params.code ?? '').toUpperCase();
    if (!CodeParam.test(code)) {
      return res.status(400).json({ ok: false, error: 'bad_code', message: 'Code is 6 characters.' });
    }
    const identity = await findIdentityByCode(code);
    if (!identity) {
      await audit(adminId, 'support_lookup_miss', code, {
        reason: queryString(req.query.reason),
      });
      return res.status(404).json({ ok: false, error: 'unknown_code', message: 'No such code.' });
    }

    let contact: { email: string | null; createdAt: string | null } = {
      email: null,
      createdAt: null,
    };
    try {
      contact = await getPrivyUserContact(identity.privy_id);
    } catch (err) {
      console.error('[admin.support] privy lookup failed:', (err as Error).message);
    }

    const data = await collectSubjectData(identity.id, await allWalletsFor(identity));
    await audit(adminId, 'support_lookup', code, {
      reason: queryString(req.query.reason),
      // Hashed, not raw: the audit row outlives an erasure request, so storing
      // the DID here would leave the person identifiable after Art. 17 deletion.
      privyIdHash: createHash('sha256').update(identity.privy_id).digest('hex'),
    });

    const { data: identRow } = await getSupabaseAdmin()
      .from('user_identity')
      .select('marketing_consent, marketing_consent_at, created_at')
      .eq('id', identity.id)
      .maybeSingle();

    return res.status(200).json({
      ok: true,
      code: identity.loyalty_code,
      email: contact.email,
      privyId: identity.privy_id,
      wallet: identity.solana_wallet,
      accountCreated: (identRow as { created_at?: string } | null)?.created_at ?? contact.createdAt,
      marketingConsent: Boolean((identRow as { marketing_consent?: boolean } | null)?.marketing_consent),
      marketingConsentAt:
        (identRow as { marketing_consent_at?: string } | null)?.marketing_consent_at ?? null,
      counts: {
        stamps: data.stamps.length,
        rewards: data.rewards.length,
        bitsTransactions: data.bitsTransactions.length,
        claims: data.claims.length,
      },
    });
  } catch (err) {
    return serverError(res, 'support', err);
  }
});

// GET /api/admin/support/:code/export — GDPR Art. 20 data export (JSON).
adminRouter.get('/support/:code/export', async (req: Request, res: Response) => {
  try {
    const adminId = (req as AuthedRequest).privyId as string;
    const code = String(req.params.code ?? '').toUpperCase();
    if (!CodeParam.test(code)) {
      return res.status(400).json({ ok: false, error: 'bad_code', message: 'Code is 6 characters.' });
    }
    const identity = await findIdentityByCode(code);
    if (!identity) {
      return res.status(404).json({ ok: false, error: 'unknown_code', message: 'No such code.' });
    }
    let email: string | null = null;
    try {
      email = (await getPrivyUserContact(identity.privy_id)).email;
    } catch {
      /* export still valid without it */
    }
    const data = await collectSubjectData(identity.id, await allWalletsFor(identity));
    await audit(adminId, 'export', code, {
      privyIdHash: createHash('sha256').update(identity.privy_id).digest('hex'),
    });

    return res.status(200).json({
      ok: true,
      export: {
        generatedAt: new Date().toISOString(),
        subject: {
          loyaltyCode: identity.loyalty_code,
          email,
          privyId: identity.privy_id,
          solanaWallet: identity.solana_wallet,
        },
        ...data,
        note: 'Account email and login history are held by Privy (our processor). Blockchain collectibles are public on Solana and cannot be deleted.',
      },
    });
  } catch (err) {
    return serverError(res, 'export', err);
  }
});

// POST /api/admin/support/:code/erase — GDPR Art. 17.
// Deletes the identity (cascades stamps/rewards/redeem codes) AND the
// wallet-keyed rows that no cascade covers (bits + claims), then records
// proof of erasure without keeping the personal data itself.
adminRouter.post('/support/:code/erase', async (req: Request, res: Response) => {
  try {
    const adminId = (req as AuthedRequest).privyId as string;
    const code = String(req.params.code ?? '').toUpperCase();
    if (!CodeParam.test(code)) {
      return res.status(400).json({ ok: false, error: 'bad_code', message: 'Code is 6 characters.' });
    }
    if ((req.body as { confirm?: unknown })?.confirm !== code) {
      return res.status(400).json({
        ok: false,
        error: 'confirm_required',
        message: 'Type the customer code to confirm erasure.',
      });
    }
    const identity = await findIdentityByCode(code);
    if (!identity) {
      return res.status(404).json({ ok: false, error: 'unknown_code', message: 'No such code.' });
    }

    const supa = getSupabaseAdmin();
    const wallets = await allWalletsFor(identity);
    const before = await collectSubjectData(identity.id, wallets);

    // Wallet-keyed tables first — they have no FK to user_identity, and there
    // may be more than one address.
    if (wallets.length > 0) {
      await supa.from('bits_transactions').delete().in('wallet_address', wallets);
      await supa.from('bits_balance').delete().in('wallet_address', wallets);
      await supa.from('claims').delete().in('wallet_address', wallets);
    }

    // Staff seats are ON DELETE SET NULL, so the row and its display name
    // would survive the identity — an employment record about a named person
    // outliving their deletion request.
    await supa.from('venue_staff').delete().eq('identity_id', identity.id);
    // Identity delete cascades stamps / rewards_redeemed / redeem_codes.
    const { error: delErr } = await supa.from('user_identity').delete().eq('id', identity.id);
    if (delErr) throw new Error(delErr.message);

    const rowsDeleted = {
      stamps: before.stamps.length,
      rewards: before.rewards.length,
      redeemCodes: before.redeemCodes.length,
      bitsTransactions: before.bitsTransactions.length,
      claims: before.claims.length,
      staffSeats: before.staffSeats.length,
      // Cascades with the identity row; counted so the erasure proof is complete.
      passportAwards: before.passportAwards.length,
      walletsCovered: wallets.length,
    };
    await supa.from('erasure_log').insert({
      privy_id_hash: createHash('sha256').update(identity.privy_id).digest('hex'),
      erased_by: adminId,
      rows_deleted: rowsDeleted,
    });
    await audit(adminId, 'erase', code, rowsDeleted);

    // A partner record is a commercial counterparty, retained on the contract
    // basis (Art. 17(3)(b)). Saying so beats reporting a complete erasure that
    // did not happen — the operator has to tell the person something true.
    const retained =
      before.partnerRecord.length > 0
        ? [
            'A referral-partner record (name, email, commission terms) was NOT deleted: it is retained for the commission contract. Deactivate the partner in the Partners panel and delete it once the contract is settled.',
          ]
        : [];

    return res.status(200).json({
      ok: true,
      erased: rowsDeleted,
      retained,
      reminder:
        'Also delete the user in the Privy dashboard (account email) — and note that on-chain collectibles are public and permanent.',
    });
  } catch (err) {
    return serverError(res, 'erase', err);
  }
});

// --- Newsletter (Substack) ---------------------------------------------------
//
// We do not send email. The newsletter lives on Substack; HeroPad's job is to
// hand the operator a clean, provably-consented recipient list, sliced the way
// a café campaign actually needs. Export → import into Substack → send.

const SEGMENT_RE = /^(all|trophies|inactive30|venue:[a-z0-9-]{2,60})$/;

// GET /api/admin/marketing/export?segment=… — consented emails as JSON rows
// (the panel turns them into the CSV Substack imports). Only identities with
// marketing_consent=true AND a stored marketing_email ever leave this endpoint
// — consent is the reason the email column exists at all. Every export lands
// in the audit log with the segment and the count, never the addresses.
adminRouter.get('/marketing/export', async (req: Request, res: Response) => {
  try {
    const adminId = (req as AuthedRequest).privyId as string;
    const segment = queryString(req.query.segment).trim() || 'all';
    if (!SEGMENT_RE.test(segment)) {
      return res.status(400).json({
        ok: false,
        error: 'bad_segment',
        message: 'Unknown segment. Use all, trophies, inactive30 or venue:<slug>.',
      });
    }
    const supa = getSupabaseAdmin();

    const { data: consentedRows, error: cErr } = await supa
      .from('user_identity')
      .select('id, marketing_email, marketing_consent_at')
      .eq('marketing_consent', true)
      .not('marketing_email', 'is', null);
    if (cErr) throw new Error(cErr.message);
    let rows = (consentedRows ?? []) as Array<{
      id: string;
      marketing_email: string;
      marketing_consent_at: string | null;
    }>;
    const ids = rows.map((r) => r.id);

    if (rows.length > 0 && segment.startsWith('venue:')) {
      const venue = await getVenueBySlug(segment.slice('venue:'.length));
      if (!venue) {
        return res
          .status(404)
          .json({ ok: false, error: 'unknown_venue', message: 'No such venue.' });
      }
      const { data: stampRows, error: sErr } = await supa
        .from('stamps')
        .select('user_identity_id')
        .eq('venue_id', venue.id)
        .is('revoked_at', null)
        .in('user_identity_id', ids);
      if (sErr) throw new Error(sErr.message);
      const visited = new Set(
        ((stampRows ?? []) as Array<{ user_identity_id: string }>).map(
          (s) => s.user_identity_id
        )
      );
      rows = rows.filter((r) => visited.has(r.id));
    } else if (rows.length > 0 && segment === 'trophies') {
      // Card trophies and passport trophies both count — a trophy is a trophy.
      const [cards, passport] = await Promise.all([
        supa
          .from('rewards_redeemed')
          .select('user_identity_id')
          .not('trophy_asset_id', 'is', null)
          .in('user_identity_id', ids),
        supa
          .from('passport_awards')
          .select('user_identity_id')
          .not('trophy_asset_id', 'is', null)
          .in('user_identity_id', ids),
      ]);
      if (cards.error) throw new Error(cards.error.message);
      if (passport.error) throw new Error(passport.error.message);
      const has = new Set(
        [...(cards.data ?? []), ...(passport.data ?? [])].map((s) => s.user_identity_id)
      );
      rows = rows.filter((r) => has.has(r.id));
    } else if (rows.length > 0 && segment === 'inactive30') {
      // "We miss you" list: nobody with a live stamp in the last 30 days.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recent, error: rErr } = await supa
        .from('stamps')
        .select('user_identity_id')
        .gt('created_at', since)
        .is('revoked_at', null)
        .in('user_identity_id', ids);
      if (rErr) throw new Error(rErr.message);
      const active = new Set(
        ((recent ?? []) as Array<{ user_identity_id: string }>).map(
          (s) => s.user_identity_id
        )
      );
      rows = rows.filter((r) => !active.has(r.id));
    }

    await audit(adminId, 'marketing_export', segment, { count: rows.length });
    return res.status(200).json({
      ok: true,
      segment,
      count: rows.length,
      subscribers: rows.map((r) => ({
        email: r.marketing_email,
        consentedAt: r.marketing_consent_at,
      })),
    });
  } catch (err) {
    return serverError(res, 'marketing-export', err);
  }
});

// GET /api/admin/audit — the accountability trail.
adminRouter.get('/audit', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('admin_audit_log')
      .select('admin_privy_id, action, subject_code, detail, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, entries: data ?? [] });
  } catch (err) {
    return serverError(res, 'audit', err);
  }
});

// --- Partners ---------------------------------------------------------------
//
// A partner brings cafés and earns a share of what those cafés pay. Everything
// the operator needs for the monthly payout run lives here: who brought what,
// which of those venues are actually paying, and how much is owed.

// GET /api/admin/partners — every partner with their venues and totals.
adminRouter.get('/partners', async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ ok: true, partners: await getPartnersOverview() });
  } catch (err) {
    return serverError(res, 'partners', err);
  }
});

const CreatePartnerBody = z.object({
  displayName: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(40).optional(),
  city: z.string().trim().max(60).optional(),
  email: z.string().trim().email().max(120).optional(),
  commissionPct: z.number().min(0).max(100).default(25),
  exclusiveCity: z.boolean().default(false),
  exclusiveUntil: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
});

// POST /api/admin/partners — create a partner + their one-time activation code.
adminRouter.post('/partners', async (req: Request, res: Response) => {
  try {
    const parsed = CreatePartnerBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    const i = parsed.data;
    const code = (i.code || suggestPartnerCode(i.displayName, i.city ?? null)).toUpperCase();
    if (await getPartnerByCode(code)) {
      return res.status(409).json({
        ok: false,
        error: 'code_taken',
        message: `Partner code ${code} already exists.`,
      });
    }
    const { partner, claimToken } = await createPartner({
      code,
      displayName: i.displayName,
      city: i.city ?? null,
      email: i.email ?? null,
      commissionPct: i.commissionPct,
      exclusiveCity: i.exclusiveCity,
      exclusiveUntil: i.exclusiveUntil || null,
      notes: i.notes ?? null,
    });
    return res.status(201).json({ ok: true, code: partner.code, activationCode: claimToken });
  } catch (err) {
    return serverError(res, 'partner-create', err);
  }
});

const UpdatePartnerBody = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().max(60).optional(),
  email: z.string().trim().email().max(120).optional(),
  commissionPct: z.number().min(0).max(100).optional(),
  exclusiveCity: z.boolean().optional(),
  exclusiveUntil: z.string().trim().max(20).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
});

// POST /api/admin/partners/:code — edit terms (commission, exclusivity, …).
adminRouter.post('/partners/:code', async (req: Request, res: Response) => {
  try {
    const partner = await getPartnerByCode(req.params.code.toUpperCase());
    if (!partner) {
      return res
        .status(404)
        .json({ ok: false, error: 'unknown_partner', message: 'No such partner.' });
    }
    const parsed = UpdatePartnerBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const i = parsed.data;
    const patch: Record<string, unknown> = {};
    if (i.displayName !== undefined) patch.display_name = i.displayName;
    if (i.city !== undefined) patch.city = i.city;
    if (i.email !== undefined) patch.email = i.email;
    if (i.commissionPct !== undefined) patch.commission_pct = i.commissionPct;
    if (i.exclusiveCity !== undefined) patch.exclusive_city = i.exclusiveCity;
    if (i.exclusiveUntil !== undefined) patch.exclusive_until = i.exclusiveUntil || null;
    if (i.active !== undefined) patch.active = i.active;
    if (i.notes !== undefined) patch.notes = i.notes;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'nothing', message: 'Nothing to update.' });
    }
    await updatePartner(partner.id, patch);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, 'partner-update', err);
  }
});

// POST /api/admin/partners/:code/reset-code — new activation code; unlinks the
// current account so a partner who lost access can be re-onboarded.
adminRouter.post('/partners/:code/reset-code', async (req: Request, res: Response) => {
  try {
    const partner = await getPartnerByCode(req.params.code.toUpperCase());
    if (!partner) {
      return res
        .status(404)
        .json({ ok: false, error: 'unknown_partner', message: 'No such partner.' });
    }
    const token = await resetPartnerClaimToken(partner.id);
    return res.status(200).json({ ok: true, activationCode: token });
  } catch (err) {
    return serverError(res, 'partner-reset', err);
  }
});

const PayoutBody = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM'),
  amount: z.number().min(0).max(1_000_000),
  venues: z.number().int().min(0).max(10_000).default(0),
  note: z.string().trim().max(200).optional(),
  paid: z.boolean().default(false),
});

// POST /api/admin/partners/:code/payouts - record (or correct) one month.
//
// The live commission figure is derived from today's billing status; this is
// the month written down. Defaulting the amount to what is currently owed
// keeps the common case one click, while still allowing a correction.
adminRouter.post('/partners/:code/payouts', async (req: Request, res: Response) => {
  try {
    const partner = await getPartnerByCode(req.params.code.toUpperCase());
    if (!partner) {
      return res
        .status(404)
        .json({ ok: false, error: 'unknown_partner', message: 'No such partner.' });
    }
    const parsed = PayoutBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const i = parsed.data;
    const row = await upsertPayout({
      partnerId: partner.id,
      period: i.period,
      amount: i.amount,
      venues: i.venues,
      paidAt: i.paid ? new Date().toISOString() : null,
      note: i.note ?? null,
    });
    return res.status(200).json({ ok: true, payout: row });
  } catch (err) {
    return serverError(res, 'payout-upsert', err);
  }
});

// POST /api/admin/partners/:code/payouts/:id/paid - settle or un-settle.
adminRouter.post('/partners/:code/payouts/:id/paid', async (req: Request, res: Response) => {
  try {
    const partner = await getPartnerByCode(req.params.code.toUpperCase());
    if (!partner) {
      return res
        .status(404)
        .json({ ok: false, error: 'unknown_partner', message: 'No such partner.' });
    }
    const paid = (req.body as { paid?: unknown })?.paid !== false;
    const ok = await markPayoutPaid(req.params.id, partner.id, paid);
    if (!ok) {
      return res
        .status(404)
        .json({ ok: false, error: 'unknown_payout', message: 'No such payout.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, 'payout-paid', err);
  }
});

/**
 * Claim by CODE ALONE — the setup code identifies its own venue, so the
 * merchant can land on /business with no parameters and still end up linked
 * to the right café. Removes the whole class of "wrong venue in the URL"
 * failures. Returns the venue slug on success.
 */
export async function claimVenueByCodeOnly(
  token: string,
  privyId: string
): Promise<{ ok: true; slug: string; name: string } | { ok: false }> {
  const supa = getSupabaseAdmin();
  const code = token.trim().toUpperCase();

  const { data: match, error } = await supa
    .from('venues')
    .select('id, slug, name, active')
    .eq('claim_token', code)
    // An owned venue is never transferable by code alone; an admin must
    // explicitly detach the current merchant first.
    .is('owner_identity_id', null)
    .gt('claim_expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`[Supabase] claimVenueByCodeOnly: ${error.message}`);
  if (!match) return { ok: false };

  const venue = match;
  if (!venue.active) return { ok: false };

  const identity = await ensureIdentity(privyId);
  // Atomic: only lands while the token still matches, and clears it.
  const { data, error: updErr } = await supa
    .from('venues')
    .update({ owner_identity_id: identity.id, claim_token: null, claim_expires_at: null })
    .eq('id', venue.id)
    .eq('claim_token', code)
    .select('id');
  if (updErr) throw new Error(`[Supabase] claimVenueByCodeOnly update: ${updErr.message}`);
  if ((data?.length ?? 0) === 0) return { ok: false };

  return { ok: true, slug: venue.slug, name: venue.name };
}

/** Exposed for the merchant claim flow in routes/loyalty.ts. */
export async function claimVenueWithToken(
  slug: string,
  token: string,
  privyId: string
): Promise<'ok' | 'bad_token' | 'unknown_venue'> {
  const venue = await getVenueBySlug(slug);
  if (!venue) return 'unknown_venue';

  const supa = getSupabaseAdmin();
  const identity = await ensureIdentity(privyId);

  // Atomic: the update only lands while the token still matches, so a code
  // can never be used twice, and it's cleared in the same statement.
  const { data, error } = await supa
    .from('venues')
    .update({ owner_identity_id: identity.id, claim_token: null, claim_expires_at: null })
    .eq('id', venue.id)
    .eq('claim_token', token.trim().toUpperCase())
    .is('owner_identity_id', null)
    .gt('claim_expires_at', new Date().toISOString())
    .select('id');
  if (error) throw new Error(`[Supabase] claimVenueWithToken: ${error.message}`);
  return (data?.length ?? 0) > 0 ? 'ok' : 'bad_token';
}
