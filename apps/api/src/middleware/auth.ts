import type { Request, Response, NextFunction } from 'express';

// TODO: verify Privy access token (or our JWT_SECRET-signed session) and attach
// `req.user = { id, walletPublicKey }`. Reject with 401 otherwise.
export function requireAuth(_req: Request, res: Response, _next: NextFunction): void {
  res.status(501).json({ error: 'auth_middleware_not_implemented' });
}
