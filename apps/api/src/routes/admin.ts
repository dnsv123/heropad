import { randomInt } from 'node:crypto';

import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { ensureIdentity, getVenueBySlug } from '../lib/loyalty-db.js';

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

function serverError(res: Response, scope: string, err: unknown): void {
  // eslint-disable-next-line no-console
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
        'id, slug, name, address, stamps_required, branding, active, owner_identity_id, claim_token, gps_lat, gps_lng, created_at'
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
      created_at: string;
    }>;

    // Per-venue activity — small volumes at pilot scale, counted in one pass.
    const [{ data: stamps }, { data: rewards }] = await Promise.all([
      supa.from('stamps').select('venue_id, user_identity_id'),
      supa.from('rewards_redeemed').select('venue_id'),
    ]);
    const stampsBy = new Map<string, number>();
    const customersBy = new Map<string, Set<string>>();
    for (const s of (stamps ?? []) as Array<{ venue_id: string; user_identity_id: string }>) {
      stampsBy.set(s.venue_id, (stampsBy.get(s.venue_id) ?? 0) + 1);
      if (!customersBy.has(s.venue_id)) customersBy.set(s.venue_id, new Set());
      customersBy.get(s.venue_id)!.add(s.user_identity_id);
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
        active: v.active,
        claimed: Boolean(v.owner_identity_id),
        setupCode: v.claim_token,
        gpsLat: v.gps_lat,
        gpsLng: v.gps_lng,
        createdAt: v.created_at,
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
  gpsLat: z.number().min(-90).max(90).nullable().optional(),
  gpsLng: z.number().min(-180).max(180).nullable().optional(),
  active: z.boolean().optional(),
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
    if (i.reward !== undefined) {
      patch.branding = { ...(venue.branding ?? {}), reward: i.reward };
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
    const patch: Record<string, unknown> = { claim_token: code };
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
    .update({ owner_identity_id: identity.id, claim_token: null })
    .eq('id', venue.id)
    .eq('claim_token', token.trim().toUpperCase())
    .select('id');
  if (error) throw new Error(`[Supabase] claimVenueWithToken: ${error.message}`);
  return (data?.length ?? 0) > 0 ? 'ok' : 'bad_token';
}
