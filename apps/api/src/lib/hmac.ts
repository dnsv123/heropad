import { createHmac, timingSafeEqual } from 'node:crypto';

// TODO: standardize the canonical payload format (e.g. `${code}:${ts}`) before signing.
export function signPayload(payload: string): string {
  const secret = process.env.HMAC_SECRET;
  if (!secret) {
    throw new Error('HMAC_SECRET not configured');
  }
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyPayload(payload: string, signatureHex: string): boolean {
  const expected = Buffer.from(signPayload(payload), 'hex');
  const actual = Buffer.from(signatureHex, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
