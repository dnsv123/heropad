# Deployment

## Frontend → Vercel

### 1. Conectare repo
1. Login pe https://vercel.com.
2. **New Project** → import `dnsv123/heropad`.
3. **Root Directory:** lasă root (`/`). `vercel.json` din rădăcină gestionează build-ul.
4. **Framework Preset:** Vite (auto-detect).
5. **Build Command:** `npm --workspace apps/web run build` (auto-completat din `vercel.json`).
6. **Output Directory:** `apps/web/dist`.

### 2. Environment variables (Vercel → Project Settings → Environment Variables)
Pentru `Production`, `Preview` și `Development` — pune doar variabilele cu prefix `VITE_*` aici (sunt single-source-of-truth pentru frontend bundle).

```
VITE_PRIVY_APP_ID         = <din Privy dashboard>
VITE_SUPABASE_URL         = <din Supabase project settings>
VITE_SUPABASE_ANON_KEY    = <din Supabase project settings>
VITE_SOLANA_RPC_URL       = <Helius devnet endpoint>
```

> ⚠️ **Nu pune variabile server-only (`SUPABASE_SERVICE_ROLE_KEY`, `SOLANA_ADMIN_PRIVATE_KEY`, `HMAC_SECRET`, `JWT_SECRET`) pe Vercel pentru frontend.** Acestea trăiesc pe API-ul backend (Vercel Functions, Railway, Fly.io, ce alegem).

### 3. Subdomeniu `heropad.supervictornft.com`
1. Vercel → Project → **Settings → Domains** → Add `heropad.supervictornft.com`.
2. Vercel îți va da un CNAME target (de obicei `cname.vercel-dns.com`).
3. La providerul DNS al `supervictornft.com` (probabil același cu unde e găzduit brand-ul existent):
   - Adaugă un record CNAME: `heropad` → `cname.vercel-dns.com`.
   - TTL recomandat: 300s pentru iterație rapidă.
4. Așteaptă propagare (de obicei <10 min). Vercel auto-emite SSL via Let's Encrypt.

### 4. SPA rewrites
`vercel.json` conține deja regula:
```json
"rewrites": [
  { "source": "/((?!api/).*)", "destination": "/index.html" }
]
```
Asta face React Router să meargă pe orice path direct (ex: `/claim?c=...`).

---

## Backend (apps/api)

În prima fază (hackathon) putem rula API-ul:

### Opțiunea A: Vercel Serverless Functions (recomandat dacă rămânem all-in pe Vercel)
- Mută codul Express în `apps/api/api/*.ts` ca handler-e Vercel.
- Avantaj: deploy zero-config, același CI/CD ca frontend.
- Dezavantaj: cold start, max execution time 10s pe plan free.

### Opțiunea B: Railway / Fly.io / Render (recomandat pentru long-running cNFT mints)
- Deploy `apps/api` ca un container Node.js.
- Avantaj: no cold start, control mai mare pe environment.
- Dezavantaj: cont separat, dolari/lună.

### Opțiunea C: Local + ngrok (doar demo)
- `npm run dev:api` pornește pe `localhost:8787`.
- `ngrok http 8787` → URL public temporar.
- OK pentru demo video; nu pentru submission live.

> **Decizie pentru hackathon:** începem cu **Opțiunea C** (Vercel + ngrok) pentru viteză, migrăm la **Opțiunea B** (Railway) pe 9-10 mai dacă avem timp.

---

## Supabase

### 1. Project setup
1. Login pe https://supabase.com → **New Project**.
2. Region: `eu-central-1` (Frankfurt) — cel mai aproape de RO.
3. Salvează `Project URL`, `anon key`, `service role key` în 1Password / `.env` local.

### 2. Schema
1. Deschide **SQL Editor**.
2. Paste `packages/db/migrations/001_initial_schema.sql`.
3. Run. Verifică în **Table Editor** că tabelele sunt create cu RLS activat.

### 3. Auth
- Activează **Email + Google** în **Authentication → Providers**.
- (Privy gestionează auth-ul UI, dar Supabase Auth e folosit ca foundation pentru `auth.users` și RLS.)

---

## Solana

### 1. Generare admin keypair
**În siguranță, OFFLINE:**
```bash
solana-keygen new --outfile ~/.config/solana/heropad-admin.json --no-bip39-passphrase
solana-keygen pubkey ~/.config/solana/heropad-admin.json
```
Salt secret: păstrează `heropad-admin.json` în 1Password / Bitwarden. **Niciodată** nu îl comite.

### 2. Airdrop devnet SOL
```bash
solana airdrop 5 <PUBKEY> --url https://api.devnet.solana.com
```

### 3. Setare RPC Helius
1. Login pe https://helius.dev.
2. Create API key, alege devnet.
3. Endpoint forma: `https://devnet.helius-rpc.com/?api-key=<KEY>`.
4. Pune în `VITE_SOLANA_RPC_URL` (frontend) și `SOLANA_RPC_URL` (backend).

### 4. Bubblegum tree creation
Script one-shot (de creat în `apps/api/scripts/create-tree.ts`):
- Allocate Merkle tree (max depth 14, max buffer 64 = ~16k cNFT-uri).
- Salvează tree address în Supabase config table sau în `.env`.

---

## Pre-launch checklist

- [ ] `.env` populat local cu toate cheile.
- [ ] `npm run typecheck` pasează pe ambele app-uri.
- [ ] Deploy preview Vercel funcționează pe URL `*.vercel.app`.
- [ ] Subdomeniu `heropad.supervictornft.com` rezolvă HTTPS.
- [ ] Supabase schema aplicată.
- [ ] Solana admin keypair are SOL pe devnet.
- [ ] Helius RPC răspunde la `getHealth`.
- [ ] Repo public pe GitHub (înainte de submit).
