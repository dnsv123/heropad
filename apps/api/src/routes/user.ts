import { Router } from 'express';

// TODO: expose `/me` (user profile + wallet + BITS) and `/me/collectibles`.
export const userRouter = Router();

userRouter.get('/me', (_req, res) => {
  res.status(501).json({ error: 'not_implemented', route: 'user.me' });
});
