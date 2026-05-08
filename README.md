# HeroPad

> **Phygital × Solana.** Where physical heroes become digital superpowers.

HeroPad is the on-chain entry point of the **SuperVictor Universe**: scan an
NFC-tagged figurine, a QR card, or a product pack — claim a Solana compressed
NFT (cNFT) tied to that exact item, earn BITS, and unlock skins in V-DASH.

[![Live](https://img.shields.io/badge/live-heropad.vercel.app-9945FF?style=flat-square)](https://heropad.vercel.app)
[![Solana](https://img.shields.io/badge/Solana-devnet-14F195?style=flat-square)](https://explorer.solana.com/?cluster=devnet)
[![Trademark](https://img.shields.io/badge/EUIPO-019287298-F5C842?style=flat-square)](https://euipo.europa.eu)

Submitted to **Solana Frontier** hackathon — May 2026.

---

## Why

Phygital products today come with a paper card, a QR linking to a webpage,
or — at best — a cheap NFT on a chain that costs a dollar to mint. None of
those scale to millions of toys, none of them connect cleanly to gameplay,
and none of them survive the brand owner pivoting to a new platform.

HeroPad does three things at once:

1. **Mints a Solana cNFT** for every figurine, card, or pack — at $0.0001 unit
   cost we issue a real on-chain collectible per toy without breaking the
   margins that drive a kids-toy business.
2. **Looks and feels Web2** — login with email or Google in 5 seconds, embedded
   wallet auto-provisioned by Privy MPC, no seed phrase to write down. The
   parent doesn't blink. The kid sees a hero appear.
3. **Plugs into a real game** — V-DASH (live on MultiversX since 2024) is the
   gameplay layer where cNFTs become wearable skins, equipment slots, and
   BITS reward multipliers in Chapter 2.

---

## Live demo

| Surface | URL |
|---|---|
| Frontend | https://heropad.vercel.app |
| API health | https://heropadapi-production.up.railway.app/healthz |
| Bubblegum tree | `GGanUtGy4Cry41XAue49YrAnEdJfsUoaBGuywkAZZzJg` (devnet) |
| Example cNFT | [Super Victor — GSYF](https://explorer.solana.com/address/9zYZJiGfeMZUA3Xn4TrtU7tHiT9gNoLZL6TLmzaGSmCp?cluster=devnet) |

Try the full claim flow: open the live URL, sign in (email is fastest), then
visit `/claim` and paste a code + signature. Test codes are seeded by
`apps/api/scripts/seed-codes.ts`.

---

## How it works

```
┌─────────────────┐  scan  ┌──────────────┐  POST /api/claim  ┌──────────────────┐
│  NFC figurine / │ ─────▶ │  HeroPad     │ ────────────────▶ │  HeroPad API     │
│  QR card / pack │        │  /claim page │                   │  (Express, RW)   │
└─────────────────┘        └──────────────┘                   └─────────┬────────┘
                                                                        │
                                              HMAC verify ◀─────────────┤
                                              Anti-double-claim         │
                                                                        ▼
                                                               ┌────────────────┐
                                                               │  Bubblegum     │
                                                               │  mint cNFT     │
                                                               │  Solana devnet │
                                                               └───────┬────────┘
                                                                       │
                                                                       ▼
                                                       ┌─────────────────────────┐
                                                       │  User's Solana wallet   │
                                                       │  (Privy MPC embedded    │
                                                       │   or Phantom/Solflare)  │
                                                       └─────────────────────────┘
```

1. Each physical item is bound to a unique code `HVPD-XXXX-XXXX`, signed by
   our HMAC secret at manufacturing time. Code + signature are encoded in the
   NFC chip or QR card.
2. User scans → lands on `heropad.vercel.app/claim?c=…&s=…`.
3. After Privy login (email / Google / Phantom), a single POST `/api/claim`
   verifies the signature, checks the code wasn't already claimed (unique
   constraint in Postgres), and issues a Bubblegum cNFT to the user's wallet.
4. cNFT lands in the wallet in ~1–2s. User earns 100 BITS, gets a Solana
   Explorer link, and sees the asset show up in their Profile collection.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React 18 + TypeScript + Tailwind + framer-motion |
| Authentication | [Privy](https://privy.io) (email, Google, Solana wallets, MPC embedded) |
| Backend | Express + TypeScript on Railway |
| Database | Supabase (Postgres + RLS, EU region) |
| Blockchain | Solana (devnet) via [Helius RPC](https://helius.dev) |
| NFT standard | [Metaplex Bubblegum](https://developers.metaplex.com/bubblegum) (compressed NFTs) |
| Asset discovery | Helius DAS API (`getAssetsByOwner`) |
| Hosting | Vercel (frontend) + Railway (API) |
| Secrets | Vercel/Railway env vars; nothing checked in |

---

## Repo layout

```
apps/
  web/                # React frontend (Vercel)
    src/
      components/     # Header, Hero, ClaimFlow, Collectibles, CollectibleModal, ...
      pages/          # Home, Claim, Profile, Play (V-DASH preview), Privacy, Terms
      lib/            # privy.ts, api.ts (typed API client)
    public/           # PNG assets, manifest.webmanifest, sw.js, cnft/super-victor.json
  api/                # Express backend (Railway)
    src/
      lib/            # hmac, solana-admin, supabase-admin, metaplex, helius
      routes/         # claim, user, mint
      index.ts        # app bootstrap, env-check, CORS allowlist
    scripts/          # create-tree.ts, seed-codes.ts (one-shots)
packages/
  shared/             # cross-process types
  db/migrations/      # Supabase SQL (001_initial_schema, 002_claims_wallet)
docs/                 # architecture, deployment, pitch, roadmap
```

---

## Local setup

```bash
# Clone + install
git clone https://github.com/dnsv123/heropad.git
cd heropad
npm install

# Configure secrets (NEVER commit .env)
cp .env.example .env
# fill in: VITE_PRIVY_APP_ID, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
# VITE_SOLANA_RPC_URL, SUPABASE_SERVICE_ROLE_KEY, SOLANA_ADMIN_PRIVATE_KEY,
# HMAC_SECRET, JWT_SECRET, VITE_API_BASE_URL

# Apply Supabase migrations (in Supabase SQL Editor)
# 1) packages/db/migrations/001_initial_schema.sql
# 2) packages/db/migrations/002_claims_wallet.sql

# Bootstrap a Bubblegum tree (one-time per environment)
npx tsx apps/api/scripts/create-tree.ts

# Generate a few demo codes (any time)
npx tsx apps/api/scripts/seed-codes.ts

# Run dev
npm run dev   # frontend on :5173, API on :8787
```

---

## Security

- **HMAC** (SHA-256) on every claim code, verified server-side with constant-
  time compare.
- **Unique-on-code** Postgres constraint prevents double-claims at the DB
  level even under concurrent requests.
- **Rate limiting** on `POST /api/claim` (30 req/min/IP).
- **CORS allowlist** scoped to `heropad.vercel.app` plus preview deployments.
- **Service role key** for Supabase used only on the backend, never reaches
  the bundle.
- **Admin keypair** kept exclusively in Railway env vars; never logged.
- **Private keys** for embedded wallets are never visible to our app — Privy
  uses MPC, the user can export to Phantom directly from the Profile.

---

## Roadmap

- **Q3-Q4 2026** — HeroPad mainnet launch · first 1,000 NFC figurines · marketplace
  integration (Magic Eden + Tensor royalty enforcement)
- **Q3Q4 2026** — V-DASH Chapter 2: Hero Gear cNFT equipment, cross-chain skin
  sync (MultiversX ↔ Solana via oracle gateway)
- **2027** — V-DASH season passes, B2B figurine partnerships (white-label
  HeroPad infrastructure for other toy brands), Solana-native game mode

---

## Trademark notice

The Super Victor character, V-mark, and SVU logo are registered trademarks of
**SVU Journey SRL**, EUIPO filing **019287298**. Use of these marks outside
the personal-display licence granted by the cNFT terms is prohibited.

---

## License

Code: MIT · Brand assets: All Rights Reserved · cNFTs: see `/terms` on the
live site.

Built with care in Sibiu by **SuperVictor Universe**.
