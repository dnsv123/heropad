import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { claimRouter } from './routes/claim.js';
import { mintRouter } from './routes/mint.js';
import { userRouter } from './routes/user.js';

// HeroPad API — entry point.
// --------------------------
// Hosts the claim, mint, and user endpoints. Designed to run anywhere Node
// runs: locally during dev (`npm run dev:api`), on Railway / Fly.io for prod,
// or wrapped in Vercel Serverless Functions if we later port to that.
//
// Security defaults:
//   - helmet() sets sane response headers (X-Content-Type-Options, etc.).
//   - cors() uses an explicit origin allowlist driven by CORS_ALLOWED_ORIGINS.
//   - Body size capped at 256kb to prevent JSON-bomb DoS.
//   - Generic error handler hides stack traces from clients.

const app = express();

// CORS — allowlist driven by env, comma-separated.
// Default for dev: localhost:5173 (Vite) + the Vercel project.
const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ??
  'http://localhost:5173,https://heropad.vercel.app,https://www.heropad.vercel.app'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin / curl with no Origin header → allow.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // Allow any *.vercel.app preview deployment of our project.
      if (/^https:\/\/heropad-[a-z0-9-]+\.vercel\.app$/.test(origin)) {
        return cb(null, true);
      }
      // eslint-disable-next-line no-console
      console.warn(`[CORS] Blocked origin: ${origin}`);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '256kb' }));

// Health probe used by Railway / uptime monitors.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'heropad-api', ts: new Date().toISOString() });
});

// Routes.
app.use('/api/claim', claimRouter);
app.use('/api/mint', mintRouter);
app.use('/api/user', userRouter);

// 404 fallback.
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'not_found' });
});

// Generic error handler — hides internals from clients.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('[API error]', err);
  res.status(500).json({
    ok: false,
    error: 'server_error',
    message: 'Something went wrong. Please try again.',
  });
};
app.use(errorHandler);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[heropad-api] listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`[heropad-api] CORS allowlist: ${allowedOrigins.join(', ')}`);
});
