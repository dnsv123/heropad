import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { claimRouter } from './routes/claim';
import { mintRouter } from './routes/mint';
import { userRouter } from './routes/user';

// TODO: replace permissive CORS with origin allowlist before production.
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'heropad-api', ts: new Date().toISOString() });
});

app.use('/v1/claim', claimRouter);
app.use('/v1/mint', mintRouter);
app.use('/v1/user', userRouter);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[heropad-api] listening on :${port}`);
});
