import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { verifyClaimPayload, isWellFormedClaimCode } from '../lib/hmac.js';
import { mintCnftToWallet } from '../lib/metaplex.js';
import {
  findCollectible,
  hasBeenClaimed,
  recordClaim,
  creditBits,
  getCharacter,
} from '../lib/supabase-admin.js';

// POST /api/claim
// ---------------
// The single endpoint that turns a scanned figurine into an on-chain cNFT.
// Flow:
//   1. Validate request body shape (zod).
//   2. Verify HMAC signature on the claim code → proves the code came from us.
//   3. Look up the collectible row + check that it has not been claimed.
//   4. Mint a cNFT to the user's Solana wallet via Bubblegum.
//   5. Record the claim row (unique constraint = atomic anti-double-claim).
//   6. Credit BITS reward.
//   7. Return the asset ID + tx signature so the frontend can show success.
//
// Security:
//   - HMAC verification uses constant-time compare (lib/hmac.ts).
//   - Wallet address is taken from the request, NOT trusted blindly — we treat
//     it as the *destination* for the mint. The user authenticated with Privy
//     client-side; spoofing a wallet here only "donates" a cNFT to someone
//     else, which is harmless (and traceable).
//   - Rate limiting: TODO Day 4 (express-rate-limit). For Day 3 we accept the
//     risk since claim codes are single-use anyway.

export const claimRouter = Router();

const ClaimBody = z.object({
  code: z.string().refine(isWellFormedClaimCode, {
    message: 'Code must match HVPD-XXXX-XXXX',
  }),
  signature: z.string().regex(/^[a-f0-9]{64}$/i, 'Signature must be 64 hex chars'),
  walletAddress: z
    .string()
    .min(32)
    .max(44)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Must be a base58 Solana address'),
  scanMethod: z.enum(['nfc', 'qr_card', 'qr_pack']),
  deviceId: z.string().optional(),
});

const BITS_REWARD_PER_CLAIM = 100;

claimRouter.post('/', async (req: Request, res: Response) => {
  // 1. Parse + validate body.
  const parsed = ClaimBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_body',
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
  }
  const { code, signature, walletAddress, scanMethod, deviceId } = parsed.data;

  try {
    // 2. HMAC verify.
    verifyClaimPayload({ code, signature });

    // 3. Look up + check uniqueness.
    const collectible = await findCollectible(code);
    if (!collectible) {
      return res.status(404).json({
        ok: false,
        error: 'unknown_code',
        message: 'This code is not in the HeroPad catalog.',
      });
    }
    if (await hasBeenClaimed(code)) {
      return res.status(409).json({
        ok: false,
        error: 'already_claimed',
        message: 'This code was already claimed.',
      });
    }

    // 4. Build cNFT metadata. We pull the character row to enrich the name.
    let characterName = 'HeroPad Collectible';
    if (collectible.character_id) {
      const character = await getCharacter(collectible.character_id);
      if (character) characterName = character.name;
    }

    const template = collectible.cnft_template as {
      name?: string;
      uri?: string;
      symbol?: string;
    };
    const name = template.name ?? `${characterName} — ${code.slice(-4)}`;
    const uri = template.uri ?? 'https://heropad.vercel.app/cnft/placeholder.json';
    const symbol = template.symbol ?? 'HEROPAD';

    // 5. Mint cNFT.
    const { assetId, signature: txSig } = await mintCnftToWallet({
      recipient: walletAddress,
      name,
      symbol,
      uri,
    });

    // 6. Record claim. Unique(code) protects against race conditions.
    try {
      await recordClaim({
        code,
        walletAddress,
        cnftMintAddress: assetId,
        scanMethod,
        deviceId,
      });
    } catch (err) {
      // If the insert fails because someone beat us to it, the cNFT is already
      // minted — bad luck for this requester. We log and surface the conflict
      // so they know not to retry. (Real-money production would rollback the
      // mint via burn; for hackathon devnet it's a $0 loss.)
      const msg = (err as Error).message;
      if (msg.includes('Already claimed')) {
        return res.status(409).json({
          ok: false,
          error: 'already_claimed',
          message: 'This code was just claimed by someone else.',
        });
      }
      throw err;
    }

    // 7. Reward BITS. Best-effort — if this fails we don't block the response.
    try {
      await creditBits(walletAddress, BITS_REWARD_PER_CLAIM, 'claim', { code, assetId });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[claim] BITS credit failed (non-fatal):', err);
    }

    return res.status(200).json({
      ok: true,
      cnftMintAddress: assetId,
      bitsAwarded: BITS_REWARD_PER_CLAIM,
      txSignature: txSig,
    });
  } catch (err) {
    const msg = (err as Error).message;
    // eslint-disable-next-line no-console
    console.error('[claim] error:', msg);

    if (msg.includes('Invalid claim code signature')) {
      return res.status(401).json({
        ok: false,
        error: 'bad_signature',
        message: 'Claim code signature did not verify.',
      });
    }
    if (msg.includes('Invalid claim code format')) {
      return res.status(400).json({
        ok: false,
        error: 'bad_code',
        message: 'Claim code format invalid.',
      });
    }
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: 'Something went wrong on our side. Please try again.',
    });
  }
});
