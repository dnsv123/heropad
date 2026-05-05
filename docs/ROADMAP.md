# Roadmap — Solana Frontier (5 zile până la 11 mai 2026)

Planul este agresiv dar realist pentru un MVP demo-ready. Fiecare zi se închide cu un commit cu scope clar și o demonstrație video scurtă (chiar și 30s) salvată în `docs/demos/`.

---

## Ziua 1 — Mier 6 mai: Foundation
**Obiectiv:** Repo viu, deploy stub pe Vercel, Supabase pornit.

- [ ] Instalare dependențe locale (`npm install`).
- [ ] Setare proiect Privy + Supabase (env vars în `.env`).
- [ ] Schema Supabase aplicată (`packages/db/migrations/001_initial_schema.sql`).
- [ ] Deploy frontend pe Vercel cu landing page minimal.
- [ ] Conectare subdomeniu `heropad.supervictornft.com`.

**Demo:** landing page live + `/health` API răspunzând.

---

## Ziua 2 — Joi 7 mai: Auth + wallet
**Obiectiv:** User poate login cu Gmail și are wallet Solana asociat.

- [ ] Integrare PrivyProvider în `apps/web`.
- [ ] Endpoint `POST /v1/user/wallet` care creează rândul în `solana_wallets` la primul login.
- [ ] UI: profil minim cu adresa wallet + buton "Copy address".
- [ ] Test flow Gmail → wallet vizibil în UI și în Supabase.

**Demo:** login Gmail → wallet pe ecran.

---

## Ziua 3 — Vin 8 mai: Claim + cNFT mint
**Obiectiv:** Un cod test mintează un cNFT real pe devnet la wallet-ul user-ului.

- [ ] Creare colecție Bubblegum + tree (script one-shot, salvat în `apps/api/scripts/`).
- [ ] Implementare `POST /v1/claim` cu validare HMAC + idempotență.
- [ ] Implementare mint Bubblegum în `apps/api/src/lib/metaplex.ts`.
- [ ] Update `claims` + `bits_transactions` în tranzacție.
- [ ] UI claim flow: scan/cod → success cu link Solana Explorer.

**Demo:** scan QR → cNFT vizibil pe explorer + în profil.

---

## Ziua 4 — Sâm 9 mai: V-DASH integration + polish
**Obiectiv:** Joc accesibil din UI, deblocare bazată pe cNFT-uri owned.

- [ ] Integrare V-DASH (iframe sau rută).
- [ ] Endpoint `GET /v1/user/me/collectibles` care listează cNFT-urile (via Helius DAS).
- [ ] Mapare cNFT → erou jucabil în V-DASH.
- [ ] BITS award la finalul unui run (endpoint `POST /v1/vdash/run`).
- [ ] UI polish: animații Framer Motion, micro-interacțiuni.

**Demo:** claim → joacă → BITS apar în profil.

---

## Ziua 5 — Dum 10 mai: Demo, video, submission
**Obiectiv:** Asset-urile de submission gata.

- [ ] Repo public (toggle private → public pe GitHub).
- [ ] Demo video 2-3 min (Loom sau editat).
- [ ] Pitch deck final (Figma → PDF).
- [ ] Update `README.md` cu link-uri reale.
- [ ] Completare `docs/HACKATHON_SUBMISSION.md`.
- [ ] Submit pe platforma Solana Frontier.

**Demo:** video final + landing live + repo public.

---

## Buffer (Lun 11 mai dimineața)
- Bug-fix critic.
- Test final pe device fizic (NFC + QR).

---

## Stretch (post-Frontier, înainte de Bags 1 iunie)
- [ ] Webhook Shopify pentru auto-import comenzi.
- [ ] Dashboard B2B simplu pentru parteneri.
- [ ] Token mechanics design pentru BITS (Bags Hackathon focus).
- [ ] Move la mainnet.
