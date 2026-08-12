// Load env vars BEFORE any other import that reads from process.env.
// We explicitly point dotenv at the repo-root .env so the API works regardless
// of CWD (npm run dev runs from apps/api, but our single source of truth for
// secrets lives at the monorepo root).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../../.env'), override: true });

import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { adminRouter } from './routes/admin.js';
import { claimRouter } from './routes/claim.js';
import { partnerRouter } from './routes/partner.js';
import { loyaltyRouter } from './routes/loyalty.js';
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

// Railway/Vercel put a reverse proxy in front of us. Without this, req.ip is
// the load balancer for EVERY visitor, so express-rate-limit would meter all
// users (and all attackers) in one shared bucket.
app.set('trust proxy', 1);

// CORS — allowlist driven by env, comma-separated.
// Default for dev: localhost:5173 (Vite) + the Vercel project.
const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ??
  'http://localhost:5173,https://heropad.vercel.app,https://www.heropad.vercel.app,https://heropad.supervictoruniverse.com'
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
      console.warn(`[CORS] Blocked origin: ${origin}`);
      // Deny without throwing: throwing surfaces as a 500 "server_error",
      // making blocked origins look like outages in monitoring.
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '256kb' }));

/**
 * Which Solana cluster the configured RPC points at, derived from the host.
 * Reported so a mainnet misconfiguration is visible from outside without
 * anyone reading the env var — the URL itself carries an API key, so only
 * this single derived word is ever exposed.
 */
function rpcCluster(): 'devnet' | 'mainnet' | 'unknown' {
  const url = process.env.SOLANA_RPC_URL ?? process.env.VITE_SOLANA_RPC_URL;
  if (!url) return 'unknown';
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (host.includes('devnet')) return 'devnet';
  if (host.includes('mainnet')) return 'mainnet';
  return 'unknown';
}

// Health probe used by Railway / uptime monitors.
app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    service: 'heropad-api',
    cluster: rpcCluster(),
    ts: new Date().toISOString(),
  });
});

// Routes.
app.use('/api/admin', adminRouter);
app.use('/api/claim', claimRouter);
app.use('/api/loyalty', loyaltyRouter);
app.use('/api/mint', mintRouter);
app.use('/api/partner', partnerRouter);
app.use('/api/user', userRouter);

// 404 fallback.
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'not_found' });
});

// Generic error handler — hides internals from clients.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[API error]', err);
  res.status(500).json({
    ok: false,
    error: 'server_error',
    message: 'Something went wrong. Please try again.',
  });
};
app.use(errorHandler);

// Quick startup self-check: confirm critical secrets are loaded. We log only
// presence (yes/no), never the actual values.
const envCheck = {
  HMAC_SECRET: Boolean(process.env.HMAC_SECRET) && (process.env.HMAC_SECRET?.length ?? 0) >= 32,
  SOLANA_ADMIN_PRIVATE_KEY: Boolean(process.env.SOLANA_ADMIN_PRIVATE_KEY),
  SUPABASE_URL: Boolean(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL),
  SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  SOLANA_RPC_URL: Boolean(process.env.SOLANA_RPC_URL ?? process.env.VITE_SOLANA_RPC_URL),
};
const allEnvOk = Object.values(envCheck).every(Boolean);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`[heropad-api] listening on http://localhost:${port}`);
  console.log('[heropad-api] env check:', envCheck, allEnvOk ? '✓ all good' : '✗ MISSING VARS');
  console.log(`[heropad-api] CORS allowlist: ${allowedOrigins.join(', ')}`);
});
