import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { ensureIdentity } from '../lib/loyalty-db.js';
import {
  claimPartnerWithToken,
  getPartnerByIdentity,
  getPartnerSummary,
} from '../lib/partners-db.js';

// Partner routes — the referral partner's own dashboard.
// ---------------------------------------------------------------------------
// A partner introduces cafés and earns a share of what those cafés pay. What
// they see here is deliberately narrow: their own venues, their own commission.
// Never a customer, never a code, never another partner's venues, and never the
// café's own statistics — those belong to the café, not to whoever introduced
// it.
//
// Access mirrors the merchant flow: log in with your own account, then type the
// one-time claim token once. Knowing the email is not enough.

export const partnerRouter = Router();

partnerRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ ok: false, error: 'rate_limited', message: 'Slow down.' }),
  })
);

function serverError(res: Response, scope: string, err: unknown): Response {
  console.error(`[partner.${scope}]`, (err as Error).message);
  return res.status(500).json({
    ok: false,
    error: 'server_error',
    message: 'Something went wrong. Please try again.',
  });
}

// GET /api/partner/me — the caller's partner dashboard, or a "not a partner"
// answer the UI turns into the claim-token prompt.
partnerRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const privyId = (req as AuthedRequest).privyId as string;
    const identity = await ensureIdentity(privyId);
    const partner = await getPartnerByIdentity(identity.id);
    if (!partner) {
      return res.status(200).json({ ok: true, isPartner: false });
    }
    if (!partner.active) {
      return res.status(403).json({
        ok: false,
        error: 'partner_inactive',
        message: 'This partner account is not active. Get in touch with us.',
      });
    }
    const summary = await getPartnerSummary(partner);
    return res.status(200).json({ ok: true, isPartner: true, ...summary });
  } catch (err) {
    return serverError(res, 'me', err);
  }
});

const ClaimBody = z.object({
  token: z.string().trim().min(4).max(32),
});

// POST /api/partner/claim — bind this logged-in account to a partner record.
partnerRouter.post('/claim', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = ClaimBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_body',
        message: 'Enter the activation code you were given.',
      });
    }
    const privyId = (req as AuthedRequest).privyId as string;
    const identity = await ensureIdentity(privyId);

    // Already a partner: claiming again would silently move the account.
    const existing = await getPartnerByIdentity(identity.id);
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: 'already_partner',
        message: 'This account is already linked to a partner.',
      });
    }

    const partner = await claimPartnerWithToken(parsed.data.token, identity.id);
    if (!partner) {
      return res.status(404).json({
        ok: false,
        error: 'bad_token',
        message: 'This activation code is not valid, or it has already been used.',
      });
    }
    const summary = await getPartnerSummary(partner);
    return res.status(200).json({ ok: true, isPartner: true, ...summary });
  } catch (err) {
    return serverError(res, 'claim', err);
  }
});
