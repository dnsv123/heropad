import { createHmac, timingSafeEqual } from 'node:crypto';

// HMAC utilities for HeroPad claim codes.
// ----------------------------------------
// Threat model: a manufacturer prints unique codes on figurines / cards / packs.
// We cannot trust the user's device — anyone scanning a code on a friend's
// figurine could try to claim it. The defense is a per-code HMAC signature
// produced by us at code generation time and verified on the backend at claim
// time. Without HMAC_SECRET an attacker can't forge a valid signature.
//
// Code format we standardize on:
//   raw:    HVPD-XXXX-XXXX                (printed / encoded in NFC)
//   signed: HVPD-XXXX-XXXX:<hex-sig>      (the full QR/NFC payload)
// We split on ":" before verification so the QR can carry both halves.
//
// Constant-time compare prevents timing attacks where an attacker tries one
// signature byte at a time and infers which prefix matched.

const HMAC_ALGO = 'sha256';

function getSecret(): string {
  const secret = process.env.HMAC_SECRET;
  if (!secret) {
    throw new Error(
      '[HMAC] HMAC_SECRET is not configured. Set it in apps/api/.env (local) or Railway/Fly env (prod).'
    );
  }
  if (secret.length < 32) {
    throw new Error('[HMAC] HMAC_SECRET must be at least 32 chars (256 bits) of entropy.');
  }
  return secret;
}

/** Signs a raw payload (e.g. claim code) and returns hex-encoded signature. */
export function signPayload(payload: string): string {
  return createHmac(HMAC_ALGO, getSecret()).update(payload).digest('hex');
}

/** Verifies a hex-encoded signature against a payload. Constant-time. */
export function verifyPayload(payload: string, signatureHex: string): boolean {
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(signPayload(payload), 'hex');
    actual = Buffer.from(signatureHex, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// --- Claim-code specific helpers ----------------------------------------

const CLAIM_CODE_REGEX = /^HVPD-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** True if the string looks like a HeroPad claim code (does not check signature). */
export function isWellFormedClaimCode(code: string): boolean {
  return CLAIM_CODE_REGEX.test(code);
}

/**
 * Sign a claim code → returns the full payload "CODE:SIG" we encode in QR/NFC.
 * Used at manufacturing time (or in tests) to produce valid demo codes.
 */
export function buildSignedClaimPayload(code: string): string {
  if (!isWellFormedClaimCode(code)) {
    throw new Error(`[HMAC] Invalid claim code format: ${code}`);
  }
  return `${code}:${signPayload(code)}`;
}

/**
 * Verify a claim payload coming from the frontend.
 * Accepts either:
 *   - The combined payload "CODE:SIG", OR
 *   - A separate `code` and `signatureHex` (already split on the client).
 * Returns the validated raw code on success, throws on failure.
 */
export function verifyClaimPayload(input: { code: string; signature: string }): string {
  const { code, signature } = input;
  if (!isWellFormedClaimCode(code)) {
    throw new Error('Invalid claim code format');
  }
  if (!verifyPayload(code, signature)) {
    throw new Error('Invalid claim code signature');
  }
  return code;
}
