import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { getBitsBalance, getSupabaseAdmin } from '../lib/supabase-admin.js';
import { ensureIdentity, getVenueBySlug } from '../lib/loyalty-db.js';
import { getStaffSeat } from '../lib/staff-db.js';
import {
  createPinOrder,
  fulfilledCountsByVenueItem,
  listPinOrders,
  setPinOrderStatus,
} from '../lib/pin-orders-db.js';
import {
  claimReward,
  expireOverdueClaims,
  fulfilClaim,
  getRewardItemBySlug,
  listAllClaims,
  listMyClaims,
  listRewardItems,
  upsertRewardItem,
  CLAIM_TTL_DAYS,
} from '../lib/rewards-db.js';

// The BITS rewards catalog.
// ---------------------------------------------------------------------------
//   rewardsRouter       — /api/rewards       customer + counter (auth)
//   rewardsAdminRouter  — /api/admin/rewards  catalog CRUD (admin allowlist,
//                          inherited from where it is mounted)

export const rewardsRouter = Router();
export const rewardsAdminRouter = Router();

function serverError(res: Response, scope: string, err: unknown): void {
  console.error(`[rewards.${scope}]`, (err as Error).message);
  res.status(500).json({ ok: false, error: 'server_error', message: 'Something went wrong.' });
}

rewardsRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ ok: false, error: 'rate_limited', message: 'Slow down.' }),
  })
);

/** Venue names for the "pick it up at" line — one query, cached per request. */
async function venueNamesById(ids: string[]): Promise<Map<string, { slug: string; name: string }>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await getSupabaseAdmin()
    .from('venues')
    .select('id, slug, name')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as Array<{ id: string; slug: string; name: string }>).map((v) => [
      v.id,
      { slug: v.slug, name: v.name },
    ])
  );
}

// GET /api/rewards/catalog — public: the shelf. No auth, so a customer who
// has not logged in yet can still see what BITS are for. That is the point.
rewardsRouter.get('/catalog', async (_req: Request, res: Response) => {
  try {
    const items = await listRewardItems();
    const venueIds = [...new Set(items.flatMap((i) => i.venue_ids ?? []))];
    const names = await venueNamesById(venueIds);
    return res.status(200).json({
      ok: true,
      items: items.map((i) => ({
        slug: i.slug,
        name: i.name,
        description: i.description,
        imageUrl: i.image_url,
        priceBits: i.price_bits,
        inStock: i.stock === null || i.stock > 0,
        stock: i.stock,
        pickupAt: (i.venue_ids ?? []).map((id) => names.get(id)).filter(Boolean),
      })),
      claimTtlDays: CLAIM_TTL_DAYS,
    });
  } catch (err) {
    return serverError(res, 'catalog', err);
  }
});

// GET /api/rewards/me — my balance + my claims (pending ones carry the code).
rewardsRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const identity = await ensureIdentity(privyId);
    await expireOverdueClaims(identity.id);

    const balance = identity.solana_wallet
      ? await getBitsBalance(identity.solana_wallet)
      : { current: 0, earned: 0, spent: 0 };
    const claims = await listMyClaims(identity.id);
    const items = await listRewardItems(true);
    const byId = new Map(items.map((i) => [i.id, i]));
    const venueIds = [...new Set(claims.map((c) => c.venue_id).filter(Boolean) as string[])];
    const names = await venueNamesById(venueIds);

    return res.status(200).json({
      ok: true,
      bits: balance.current,
      claims: claims.map((c) => ({
        id: c.id,
        itemSlug: byId.get(c.reward_id)?.slug ?? null,
        itemName: byId.get(c.reward_id)?.name ?? '—',
        imageUrl: byId.get(c.reward_id)?.image_url ?? null,
        code: c.status === 'pending' ? c.code : null,
        priceBits: c.price_bits,
        status: c.status,
        expiresAt: c.expires_at,
        fulfilledAt: c.fulfilled_at,
        fulfilledAt_venue: c.venue_id ? names.get(c.venue_id)?.name ?? null : null,
        createdAt: c.created_at,
      })),
    });
  } catch (err) {
    return serverError(res, 'me', err);
  }
});

// POST /api/rewards/:slug/claim — spend BITS, get a code.
rewardsRouter.post('/:slug/claim', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const identity = await ensureIdentity(privyId);
    if (!identity.solana_wallet) {
      return res.status(400).json({
        ok: false,
        error: 'no_vault',
        message: 'Your vault is still being set up — open your Profile once and try again.',
      });
    }
    const item = await getRewardItemBySlug(req.params.slug);
    if (!item || !item.active) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Unknown reward.' });
    }

    await expireOverdueClaims(identity.id);
    const outcome = await claimReward(identity.id, identity.solana_wallet, item);
    if (!outcome.ok) {
      const messages: Record<string, string> = {
        insufficient_bits: 'Not enough BITS yet — keep collecting.',
        out_of_stock: 'This one just ran out. Check back soon.',
        already_pending: 'You already have a code for this — show it at the counter.',
        not_found: 'Unknown reward.',
      };
      return res
        .status(409)
        .json({ ok: false, error: outcome.error, message: messages[outcome.error] });
    }
    const balance = await getBitsBalance(identity.solana_wallet);
    return res.status(200).json({
      ok: true,
      code: outcome.claim.code,
      expiresAt: outcome.claim.expires_at,
      bits: balance.current,
    });
  } catch (err) {
    return serverError(res, 'claim', err);
  }
});

const FulfilBody = z.object({ code: z.string().trim().min(6).max(6) });

// POST /api/rewards/counter/:slug/fulfil — the barista types the code.
// Owner or active staff of that venue.
rewardsRouter.post('/counter/:slug/fulfil', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const venue = await getVenueBySlug(req.params.slug);
    if (!venue || !venue.active) {
      return res.status(404).json({ ok: false, error: 'unknown_venue', message: 'Unknown venue.' });
    }
    const identity = await ensureIdentity(privyId);
    const isOwner = Boolean(venue.owner_identity_id && venue.owner_identity_id === identity.id);
    if (!isOwner && !(await getStaffSeat(venue.id, identity.id))) {
      return res
        .status(403)
        .json({ ok: false, error: 'not_merchant', message: 'Your account cannot serve this venue.' });
    }

    const parsed = FulfilBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'invalid_body', message: 'Send { code }.' });
    }

    const result = await fulfilClaim(parsed.data.code, venue.id, identity.id);
    if (!result) {
      return res.status(404).json({
        ok: false,
        error: 'no_such_code',
        message: 'No live reward code matches — it may be expired, already handed over, or for another venue.',
      });
    }
    return res.status(200).json({
      ok: true,
      item: { slug: result.item.slug, name: result.item.name, imageUrl: result.item.image_url },
      priceBits: result.claim.price_bits,
    });
  } catch (err) {
    return serverError(res, 'fulfil', err);
  }
});

// --- Admin -------------------------------------------------------------------

const ItemBody = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug: lowercase letters, digits and dashes only'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  // Either a path under /public or a WebP/PNG data URL the admin page
  // already resized (≤600px) — same approach as venue logos, no bucket.
  imageUrl: z
    .string()
    .trim()
    .max(200_000)
    .refine(
      (s) => s === '' || s.startsWith('/') || /^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/.test(s),
      'imageUrl must be a /path or a WebP/PNG data URL'
    )
    .optional(),
  priceBits: z.number().int().min(1).max(1_000_000),
  /** null = unlimited */
  stock: z.number().int().min(0).nullable().optional(),
  /** venue slugs; empty = any venue */
  venueSlugs: z.array(z.string().trim().min(1)).max(50).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

rewardsAdminRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const [items, claims] = await Promise.all([listRewardItems(true), listAllClaims()]);
    // Every active venue, so the editor can offer checkboxes instead of
    // asking for slugs to be typed from memory.
    const { data: venueRows, error: vErr } = await getSupabaseAdmin()
      .from('venues')
      .select('id, slug, name, active')
      .order('name', { ascending: true });
    if (vErr) throw new Error(vErr.message);
    const allVenues = (venueRows ?? []) as Array<{ id: string; slug: string; name: string; active: boolean }>;
    const names = new Map(allVenues.map((v) => [v.id, { slug: v.slug, name: v.name }]));
    return res.status(200).json({
      ok: true,
      venues: allVenues.filter((v) => v.active).map((v) => ({ slug: v.slug, name: v.name })),
      items: items.map((i) => ({
        ...i,
        venueSlugs: (i.venue_ids ?? []).map((id) => names.get(id)?.slug).filter(Boolean),
      })),
      claims: claims.map((c) => ({
        ...c,
        venue_name: c.venue_id ? names.get(c.venue_id)?.name ?? null : null,
      })),
    });
  } catch (err) {
    return serverError(res, 'admin-list', err);
  }
});

rewardsAdminRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = ItemBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    const d = parsed.data;

    let venueIds: string[] | null = null;
    if (d.venueSlugs && d.venueSlugs.length > 0) {
      const { data, error } = await getSupabaseAdmin()
        .from('venues')
        .select('id, slug')
        .in('slug', d.venueSlugs);
      if (error) throw new Error(error.message);
      venueIds = ((data ?? []) as Array<{ id: string }>).map((v) => v.id);
    }

    const row = await upsertRewardItem({
      slug: d.slug,
      name: d.name,
      description: d.description ?? null,
      image_url: d.imageUrl ?? null,
      price_bits: d.priceBits,
      stock: d.stock === undefined ? null : d.stock,
      venue_ids: venueIds,
      ...(d.sortOrder !== undefined ? { sort_order: d.sortOrder } : {}),
      ...(d.active !== undefined ? { active: d.active } : {}),
    });
    return res.status(200).json({ ok: true, item: row });
  } catch (err) {
    return serverError(res, 'admin-save', err);
  }
});

// --- Admin: physical lots to venues (pins) ----------------------------------

/** Default wholesale price per pin, lei. Overridable per order. */
const PIN_UNIT_PRICE_DEFAULT = 15;
/** Starter kit: this many of EACH active model, free. */
const STARTER_PER_MODEL = 5;

// GET /api/admin/rewards/orders — venues × models with derived stock, plus
// every lot ever created.
rewardsAdminRouter.get('/orders', async (_req: Request, res: Response) => {
  try {
    const supa = getSupabaseAdmin();
    const { data: venues, error } = await supa
      .from('venues')
      .select('id, slug, name, billing_status, active')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    const [items, orders, fulfilled] = await Promise.all([
      listRewardItems(true),
      listPinOrders(),
      fulfilledCountsByVenueItem(),
    ]);

    // Stock per (venue, item): lots that physically left us, minus hand-overs.
    const shipped = new Map<string, number>();
    for (const o of orders) {
      if (o.status === 'planned') continue;
      const k = `${o.venue_id}|${o.reward_id}`;
      shipped.set(k, (shipped.get(k) ?? 0) + o.qty);
    }

    return res.status(200).json({
      ok: true,
      defaults: { unitPrice: PIN_UNIT_PRICE_DEFAULT, starterPerModel: STARTER_PER_MODEL },
      items: items.map((i) => ({ id: i.id, slug: i.slug, name: i.name, imageUrl: i.image_url, active: i.active })),
      venues: (venues ?? []).map((v: Record<string, unknown>) => {
        const vid = v.id as string;
        const starterSent = orders.some((o) => o.venue_id === vid && o.kind === 'starter');
        return {
          id: vid,
          slug: v.slug,
          name: v.name,
          billingStatus: v.billing_status ?? 'trial',
          active: v.active,
          starterSent,
          stock: items.map((i) => {
            const k = `${vid}|${i.id}`;
            return {
              itemId: i.id,
              shipped: shipped.get(k) ?? 0,
              handedOver: fulfilled.get(k) ?? 0,
              left: (shipped.get(k) ?? 0) - (fulfilled.get(k) ?? 0),
            };
          }),
        };
      }),
      orders: orders.map((o) => ({ ...o, unit_price: Number(o.unit_price) })),
    });
  } catch (err) {
    return serverError(res, 'orders-list', err);
  }
});

const OrderBody = z.object({
  venueSlug: z.string().trim().min(1),
  itemSlug: z.string().trim().min(1),
  qty: z.number().int().min(1).max(1000),
  kind: z.enum(['starter', 'purchase']).default('purchase'),
  unitPrice: z.number().min(0).max(1000).optional(),
  note: z.string().trim().max(300).optional(),
});

// POST /api/admin/rewards/orders — one lot: one model, one venue.
rewardsAdminRouter.post('/orders', async (req: Request, res: Response) => {
  try {
    const parsed = OrderBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'invalid_body', message: parsed.error.issues.map((i) => i.message).join('; ') });
    }
    const d = parsed.data;
    const venue = await getVenueBySlug(d.venueSlug);
    const item = await getRewardItemBySlug(d.itemSlug);
    if (!venue || !item) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Unknown venue or item.' });
    }
    const row = await createPinOrder({
      venueId: venue.id,
      rewardId: item.id,
      qty: d.qty,
      kind: d.kind,
      unitPrice: d.kind === 'starter' ? 0 : d.unitPrice ?? PIN_UNIT_PRICE_DEFAULT,
      note: d.note ?? null,
    });
    return res.status(200).json({ ok: true, order: row });
  } catch (err) {
    return serverError(res, 'orders-create', err);
  }
});

// POST /api/admin/rewards/orders/starter — the free kit: N of every active
// model, in one click. Refuses if the venue already got one.
rewardsAdminRouter.post('/orders/starter', async (req: Request, res: Response) => {
  try {
    const slug = String(req.body?.venueSlug ?? '').trim();
    const venue = slug ? await getVenueBySlug(slug) : null;
    if (!venue) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Unknown venue.' });
    }
    const existing = (await listPinOrders()).some(
      (o) => o.venue_id === venue.id && o.kind === 'starter'
    );
    if (existing) {
      return res.status(409).json({ ok: false, error: 'already_sent', message: 'This venue already has a starter kit.' });
    }
    const items = await listRewardItems();
    const created = [];
    for (const it of items) {
      created.push(
        await createPinOrder({
          venueId: venue.id,
          rewardId: it.id,
          qty: STARTER_PER_MODEL,
          kind: 'starter',
          unitPrice: 0,
          note: 'Set de start',
        })
      );
    }
    return res.status(200).json({ ok: true, created: created.length });
  } catch (err) {
    return serverError(res, 'orders-starter', err);
  }
});

const StatusBody = z.object({ status: z.enum(['planned', 'sent', 'paid']) });

// POST /api/admin/rewards/orders/:id/status
rewardsAdminRouter.post('/orders/:id/status', async (req: Request, res: Response) => {
  try {
    const parsed = StatusBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'invalid_body', message: 'Send { status }.' });
    }
    await setPinOrderStatus(req.params.id, parsed.data.status);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, 'orders-status', err);
  }
});
