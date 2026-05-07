# HeroPad — Ghid tehnic în română

Document intern pentru tine, Vali. Acoperă: cum e construit, cum funcționează,
cum debug-uiezi, cum adaugi coduri noi, cum scalezi când vine traffic real.

---

## Arhitectură pe scurt

```
Vercel (frontend)  ──HTTPS──▶  Railway (API)  ──RPC──▶  Solana devnet
                                     │
                                     ├── Supabase (Postgres EU)
                                     └── Helius DAS (asset discovery)
```

- **Frontend** (`apps/web`) — React, deploy automat pe Vercel din branch `main`.
- **Backend** (`apps/api`) — Express, deploy automat pe Railway din branch `main`.
- **DB** — Supabase, hostat în Frankfurt (EU). 7 tabele, RLS pe toate.
- **Blockchain** — Solana devnet pentru hackathon, mainnet după.

---

## Cum funcționează un claim end-to-end

1. **User scanează** o figurină NFC sau QR card. URL-ul codat pe chip e:
   ```
   https://heropad.vercel.app/claim?c=HVPD-XXXX-XXXX&s=<signature_hex>
   ```
   `c` = codul (unique per item), `s` = HMAC-ul codului (signature, 64 hex chars).

2. **Pagina /claim** (din `apps/web/src/pages/Claim.tsx`) citește cele 2 query
   params, le pasează la `<ClaimFlow />`.

3. **`ClaimFlow.tsx`** — dacă userul e logat în Privy și are cel puțin un wallet
   Solana, se face auto-submit: POST către `/api/claim` cu body:
   ```json
   {
     "code": "HVPD-XXXX-XXXX",
     "signature": "...",
     "walletAddress": "<adresa_user>",
     "scanMethod": "qr_card"
   }
   ```

4. **API endpoint `/api/claim`** (`apps/api/src/routes/claim.ts`):
   - Validează shape-ul body-ului cu zod
   - Verifică HMAC: `verifyClaimPayload(code, signature)` recomputează signature
     din `HMAC_SECRET` și o compară timing-safe. Dacă nu match → 401 bad_signature
   - Caută codul în `collectibles_catalog`. Dacă nu există → 404 unknown_code
   - Verifică `claims` table — dacă codul e deja folosit → 409 already_claimed
   - Mintează cNFT cu Bubblegum: `mintCnftToWallet({ recipient, name, uri, ... })`
   - Inserează rândul în `claims` (anti-double-claim prin unique constraint pe `code`)
   - Adaugă +100 BITS în `bits_transactions` și actualizează `bits_balance`
   - Returnează `{ ok: true, cnftMintAddress, bitsAwarded, txSignature }`

5. **Frontend** afișează success state: nume cNFT, mint address, link Solana
   Explorer, link la Profile.

6. **Profile** (`/profile`) cere `GET /api/user/me?wallet=...` care întoarce
   BITS balance + listă cNFT-uri (din Helius DAS API, filtrate pe Bubblegum
   tree-ul nostru).

---

## Cum adaugi coduri noi pentru o producție de figurine

Pentru hackathon avem `seed-codes.ts` care generează 5 coduri random pentru
demo. Pentru o producție reală (de exemplu 1000 de figurine):

```bash
# Generezi 1000 de coduri (modifică NUM_CODES în script)
npx tsx apps/api/scripts/seed-codes.ts
```

Output: pentru fiecare cod, output-ul include URL-ul Prod (cu heropad.vercel.app)
care trebuie scris pe chip-ul NFC sau printat ca QR pe card / pack.

**Workflow producție:**
1. Generezi N coduri în Supabase
2. Export CSV cu codurile + signatures (din Supabase Table Editor)
3. La fabrică / atelier, mașina de imprimare NFC primește CSV-ul
4. Pentru fiecare cod, scrie URL-ul `https://heropad.vercel.app/claim?c=...&s=...`
   pe chip
5. Etichetezi figurina cu chip-ul respectiv

---

## Variabilele de mediu — ce, unde și de ce

### Frontend (Vercel)

Toate cu prefix `VITE_*` — ajung în bundle-ul JS public.

| Variabilă | Pentru ce |
|---|---|
| `VITE_PRIVY_APP_ID` | App ID Privy, public |
| `VITE_SUPABASE_URL` | URL proiect Supabase |
| `VITE_SUPABASE_ANON_KEY` | Cheie publică Supabase (cu RLS) |
| `VITE_SOLANA_RPC_URL` | Helius devnet endpoint |
| `VITE_API_BASE_URL` | URL Railway pentru API (`https://heropadapi-production.up.railway.app`) |

### Backend (Railway)

Server-only, NU au prefix VITE. Sensibile.

| Variabilă | Pentru ce |
|---|---|
| `HMAC_SECRET` | 32+ chars, semnează codurile claim |
| `SOLANA_ADMIN_PRIVATE_KEY` | Base58, walletul care plătește mint-uri |
| `SUPABASE_URL` | Same as frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS pe backend |
| `SOLANA_RPC_URL` | Helius endpoint (server-side) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins |
| `PUBLIC_BASE_URL` | URL Vercel, folosit în seed-codes URL output |

---

## Cum debug-uiezi când ceva nu merge

### "Localhost ecran negru"

Cauză: env vars nu se citesc de Vite.
- Verifică că `VITE_PRIVY_APP_ID` e în `.env` la repo root
- `vite.config.ts` are `envDir: '../..'` — fără asta nu vede .env din root
- Restart `npm run dev` după modificare .env

### "Claim cu 401 bad_signature"

Cauză: HMAC_SECRET diferit între seed și verify.
- Verifică că `HMAC_SECRET` e identic pe Railway ↔ `.env` local
- Dacă l-ai schimbat, re-rulează `seed-codes.ts` ca să generezi coduri noi cu HMAC nou

### "Claim 409 already_claimed dar n-am claim-at niciodată"

Cauză: codul a fost deja folosit (eventual de un test anterior cu același cod).
- Folosește alt cod din lista Supabase
- Sau șterge rândul din `claims` table (dev only, nu se face în production)

### "Profile collection arată gol dar am cNFT-uri pe explorer"

Cauză: Helius DAS indexer încă nu a procesat noul mint, sau filtru tree wrong.
- Așteaptă 2-5 min după mint
- Verifică în Railway logs: `[user.me] error: ...`
- Verifică în Supabase `solana_config` că `bubblegum_tree` are valoarea corectă

### "Cum văd ce face API-ul în production?"

Railway → service `@heropad/api` → tab **Logs**. Live tail. Caută:
- `[Solana]` pentru mint-uri
- `[claim]` pentru endpoint
- `[user.me]` pentru profile load
- `[Bubblegum]` pentru parseLeaf fallback warnings

---

## Tabelele Supabase — ce conține fiecare

| Tabela | Ce stochează | Important |
|---|---|---|
| `solana_wallets` | (legacy, nu folosim) | Ignoră |
| `characters` | Catalogul de eroi (Super Victor, etc.) | Lookup pentru `cnft_template.name` |
| `collectibles_catalog` | TOATE codurile de figurine emise | code, signature, distribution_channel, batch_id |
| `claims` | Câte un rând per claim succesfic | unique pe code → anti-double |
| `bits_balance` | Materialized BITS per wallet | doar cache, sursa de adevăr e bits_transactions |
| `bits_transactions` | Append-only ledger BITS | Sumă pe wallet_address = balance corect |
| `solana_config` | Singletons (bubblegum_tree address etc.) | Folosit de mintCnft să știe în ce tree |

---

## Cum se conectează la V-DASH (Hall of Heroes)

V-DASH e pe MultiversX. Integration cross-chain:

1. V-DASH backend (Hall of Heroes) cere la HeroPad: "ce wallet Solana are user
   X?". User leagă manual wallet-ul Solana în profilul V-DASH.
2. V-DASH cere `GET /api/user/me?wallet=...` la HeroPad → primește lista de
   cNFT-uri owned și BITS earned.
3. V-DASH rulează logică internă: dacă userul are cNFT X → unlock skin Y în joc.

Pentru hackathon NU implementăm asta — e roadmap Chapter 2.

---

## Migrarea pe mainnet (post-hackathon)

Pași concreți, în ordine:

1. **Generezi nou admin keypair** offline (`solana-keygen new`), fund cu SOL
   real (~0.5 SOL pentru tree creation)
2. **Schimbi `SOLANA_RPC_URL`** la endpoint Helius mainnet (cumperi plan plătit
   cca $0-29/lună)
3. **Rulezi `create-tree.ts`** pe mainnet — costă ~0.05 SOL real
4. **Migrezi metadata** la Arweave / Pinata (permanent storage) — script de
   făcut, dar simplu
5. **Schimbi explorer URLs** în cod: `?cluster=devnet` → eliminat (default = mainnet)
6. **Update Privy dashboard** la mainnet config
7. **Audit final** — eventual contractor extern pentru securitate
8. **Lansezi**

---

## Costuri estimate

### Devnet (acum, hackathon)

- Vercel: free
- Railway: free tier (500h/lună suficient)
- Supabase: free tier (500MB DB + 2GB storage)
- Helius: free tier (100k req/zi)
- Privy: free tier (1000 active users/lună)
- Solana devnet: free SOL la cerere
- **Total: $0/lună**

### Mainnet (lansare reală)

- Vercel Pro: $20/lună (sau free dacă rămâi sub limite)
- Railway Hobby: $5/lună (1GB RAM)
- Supabase Pro: $25/lună (8GB DB + features)
- Helius Pro: $29/lună (1M req/zi)
- Privy Starter: $99/lună sau free dacă <1k MAU
- Solana mainnet: ~0.05 SOL la setup + ~0.0001 SOL per mint
- **Total: $80-180/lună la <10k useri**

---

## Contact tehnic / colaborare

Tu ești tech lead, eu (Claude) sunt asistent. Pentru orice debug sau evoluție,
deschide o sesiune cu mine și pornim din `feature/<nume-feature>` branch.

Repo: https://github.com/dnsv123/heropad
Owner: SVU Journey SRL · dinescuioanvalentin@gmail.com / supervictoruniverse@gmail.com
