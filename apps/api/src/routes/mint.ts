import { Router } from 'express';

// TODO: mint a compressed NFT via Metaplex Bubblegum to the user's Privy wallet.
// Auth-protected; idempotent on (claim_code, user_id).
export const mintRouter = Router();

mintRouter.post('/', (_req, res) => {
  res.status(501).json({ error: 'not_implemented', route: 'mint' });
});
