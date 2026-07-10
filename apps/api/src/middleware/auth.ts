import type { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';

// Real auth middleware — verifies the Privy access token sent by the frontend.
// ---------------------------------------------------------------------------
// The frontend obtains the token via usePrivy().getAccessToken() and sends it
// as `Authorization: Bearer <token>`. We verify it against Privy's servers
// (signature + expiry + app id) and attach the caller's Privy DID to the
// request. Routes behind this middleware can trust `req.privyId`.
//
// PRIVY_APP_SECRET is server-only (never VITE_-prefixed). PRIVY_APP_ID falls
// back to the public VITE_ value since the app id itself is not a secret.

let cachedClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (cachedClient) return cachedClient;
  const appId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      '[Privy] PRIVY_APP_ID (or VITE_PRIVY_APP_ID) and PRIVY_APP_SECRET must be set. ' +
        'Create the secret in the Privy dashboard → API keys.'
    );
  }
  cachedClient = new PrivyClient(appId, appSecret);
  return cachedClient;
}

/** Request enriched with the verified Privy user id (DID). */
export interface AuthedRequest extends Request {
  privyId?: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) {
    res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Missing Authorization: Bearer <token> header.',
    });
    return;
  }

  try {
    const claims = await getPrivyClient().verifyAuthToken(token);
    (req as AuthedRequest).privyId = claims.userId;
    next();
  } catch {
    res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Invalid or expired session. Please log in again.',
    });
  }
}
