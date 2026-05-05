import { Router } from 'express';

// TODO: validate claim code, verify HMAC signature, ensure code is not already claimed,
// then enqueue a mint job (or call mint route synchronously).
export const claimRouter = Router();

claimRouter.post('/', (_req, res) => {
  res.status(501).json({ error: 'not_implemented', route: 'claim' });
});
