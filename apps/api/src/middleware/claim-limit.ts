import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

import type { AuthedRequest } from './auth.js';

// Activation-code endpoints need a limit the router-wide one cannot give.
// ---------------------------------------------------------------------------
// The security audit did the arithmetic: a staff activation code matched
// against every venue at once, with fifty cafés holding a pending seat, is
// roughly nine million expected guesses. A 120/min per-IP limit reads like a
// defence until you notice the key is the raw IP — any VPS with a routine /64
// has 2^64 independent buckets, and the limit becomes decorative.
//
// Two corrections here:
//   1. Key on the authenticated account first. An attacker can rotate
//      addresses freely but cannot rotate a verified Privy identity cheaply.
//   2. When there is no account, mask IPv6 to its /64 so a single allocation
//      is one bucket rather than eighteen quintillion.
//
// Ten attempts an hour is generous for someone typing a code off a slip of
// paper, and it turns a minutes-long brute force into millennia.

/**
 * Collapses an IPv6 address to its /64. A routine allocation is 2^64
 * addresses, so keying on the full address gives one attacker as many buckets
 * as they care to use — the limit stops being a limit. IPv4 is left alone.
 */
function ipv6Aware(ip: string): string {
  if (!ip.includes(':')) return ip;
  const bare = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!bare.includes(':')) return bare; // IPv4-mapped
  // Expand once so ::/-compressed forms land on the same key as written-out ones.
  const [head] = bare.split('%'); // drop any zone id
  const parts = head.split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts.length > 1 && parts[1] ? parts[1].split(':') : [];
  const fill = Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0');
  const groups = [...left, ...fill, ...right].map((g) => g.padStart(4, '0'));
  return groups.slice(0, 4).join(':') + '::/64';
}

export const claimAttemptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const privyId = (req as AuthedRequest).privyId;
    if (privyId) return `acct:${privyId}`;
    return `ip:${ipv6Aware(req.ip ?? '')}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      ok: false,
      error: 'too_many_attempts',
      message: 'Too many activation attempts. Wait an hour, or ask for a new code.',
    });
  },
});
