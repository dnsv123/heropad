# HeroPad — Status Report

> Snapshot la 7 May 2026, înainte de submission Solana Frontier.
> Răspunde la: ce am făcut, ce mai e de făcut, ce putem face în viitor,
> cum integrăm Shopify, cum monetizăm, cum aplicăm pentru bine social.

---

## 1. Ce am implementat (ce e LIVE acum)

### Frontend (`apps/web`) — complet

- ✅ Vite + React 18 + TypeScript + Tailwind + framer-motion
- ✅ Branding SuperVictor: paletă (hero blue/cyan/gold + Solana purple),
   tipografie Space Grotesk, wordmark cu shimmer gradient animat
- ✅ React Router cu rutele `/`, `/claim`, `/profile`, `/v-dash`,
   `/privacy`, `/terms` + catch-all
- ✅ Header sticky cu nav desktop + drawer mobile, badge wallet + Logout
- ✅ Hero section split layout, character mascot cu float Y-axis, ring
   rotativ glow, fade-up stagger pe text
- ✅ HowItWorks 3 carduri color-coded cu reveal-on-scroll
- ✅ WhySolana 3 carduri cu Diamond Hands accent vizibil
- ✅ Footer cu SVU logo, Privacy/Terms links, GitHub/X, version badge
- ✅ Privy SDK v1.99 cu PrivyProvider configurat (Solana-only chain type,
   accent purple, dark theme)
- ✅ Login Email + Google + External wallet (Phantom/Solflare/Brave)
- ✅ Embedded wallet auto-create on first login (Privy MPC, Solana)
- ✅ Anti-duplicate guard (verifică user.linkedAccounts)
- ✅ Multi-wallet display în Profile (badge color-coded Embedded/External)
- ✅ Copy address per wallet + Export private key (modal Privy securizat)
- ✅ Account linking (Link email / Google / external wallet din Profile)
- ✅ Info text instructiv: "Import private key NOT recovery phrase" pentru Phantom
- ✅ ClaimFlow cu auto-submit la URL params (`?c=&s=`), success state cu
   mint address + Solana Explorer link, error handling friendly per error code
- ✅ Collectibles widget în Profile (citește Helius DAS API filter pe tree-ul nostru)
- ✅ Modal viewer cNFT cu image full-res, traits, Copy Asset ID, Download image,
   View on Explorer, Esc/backdrop close
- ✅ V-DASH preview page `/v-dash` cu cross-product narrative, 3 feature
   cards (Skins/Gear/BITS), roadmap timeline, closing CTA
- ✅ Privacy + Terms pages (8 + 11 secțiuni, GDPR/MiCA aware)
- ✅ PWA: manifest.webmanifest, service worker, apple-touch-icon, OG/Twitter
   meta tags, "Add to Home Screen" install prompt
- ✅ vite-plugin-node-polyfills pentru buffer/process pe care Solana SDKs le cer

### Backend (`apps/api`) — complet

- ✅ Express + TypeScript + helmet + CORS allowlist driven by env
- ✅ HMAC sign+verify cu timing-safe compare, claim code helpers
- ✅ Solana admin: keypair loader (base58 + JSON), Connection, Umi cu Bubblegum
- ✅ Supabase service-role client cu funcții typed (findCollectible,
   hasBeenClaimed, recordClaim, creditBits, getBitsBalance, etc.)
- ✅ Bubblegum cNFT mint: `mintCnftToWallet` cu fallback parser via tree state,
   royalty 5% default
- ✅ Helius DAS client (`getAssetsByOwner` filtered pe tree-ul nostru)
- ✅ POST `/api/claim`: zod validation + HMAC + anti-double-claim + BITS
   reward + return mint address + signature
- ✅ GET `/api/user/me?wallet=`: BITS balance + collectibles list, cu cache 10s
- ✅ Rate limiting `/api/claim` (30 req/min/IP)
- ✅ Startup env-check care loghează care variabile sunt setate
- ✅ Healthcheck `/healthz`
- ✅ Scripturi one-shot: `create-tree.ts` (bootstrap Bubblegum tree),
   `seed-codes.ts` (genereaza coduri demo cu HMAC)

### Database (`packages/db`)

- ✅ Schema 001: solana_wallets, characters, collectibles_catalog, claims,
   bits_balance, bits_transactions (toate cu RLS)
- ✅ Migration 002: wallet_address ca user identifier, solana_config table

### Infrastructure

- ✅ Frontend deploy live pe Vercel (`heropad.vercel.app`) cu auto-redeploy din `main`
- ✅ Backend deploy live pe Railway (`heropadapi-production.up.railway.app`)
   cu auto-redeploy din `main`
- ✅ Database live pe Supabase (Frankfurt EU), schema aplicată
- ✅ Bubblegum tree creat pe Solana devnet: `GGanUtGy4Cry41XAue49YrAnEdJfsUoaBGuywkAZZzJg`
- ✅ Helius RPC devnet configurat
- ✅ Privy app configurat: Email + Google OAuth (cu credentials proprii) + Solana wallets
- ✅ `.env.example` template + `.env` local + Vercel env vars + Railway env vars
- ✅ `.gitignore` strict cu paranoia pe chei/secrets
- ✅ README în engleză (pentru judges) + docs/HEROPAD_RO.md (pentru Vali, română)

### Validation milestones (testat real)

- ✅ Login Email funcționează
- ✅ Login Google funcționează
- ✅ Login Phantom (extern) funcționează
- ✅ Embedded wallet auto-creat la signup nou
- ✅ Export key deschide modal Privy securizat
- ✅ Account linking (Link email / external wallet) funcționează
- ✅ **Claim end-to-end pe devnet** funcționează (de pe localhost și de pe production)
- ✅ **Claim de pe TELEFON** prin URL Vercel funcționează (testat în mesajul anterior)
- ✅ cNFT vizibil pe Solana Explorer cu metadata + image
- ✅ Profile afișează BITS earned + collection cu thumbnails
- ✅ Modal viewer Open/Close + Download image
- ✅ V-DASH preview page renderează corect

---

## 2. Ce mai e de făcut

### Critical pentru submission (~3-4h)

- 🔲 **Pitch deck** convertit din `docs/PITCH_DECK.md` în Google Slides /
   Pitch / Canva (~1h)
- 🔲 **Demo video** înregistrat conform `docs/DEMO_VIDEO_SCRIPT.md` (~2h
   recording + editing)
- 🔲 **Submission form** completat pe portal Solana Frontier (~30min)
- 🔲 **Final QA pass** pe production: claim live cu un cod nou, verifică
   colectia, click pe câteva acțiuni, hard refresh (~30min)

### Nice-to-have post-submission (1-3 zile)

- 🔲 **Edge case test:** double-claim → verifică 409 mesaj friendly
- 🔲 **Custom domain** `heropad.supervictornft.com` în loc de heropad.vercel.app
   (15min DNS + propagare)
- 🔲 **Re-mint cNFT-uri broken** cu URI corect (script de update metadata)
- 🔲 **Sentry / error tracking** integrare (gratis tier)
- 🔲 **Sound effect** "ding!" la claim success (optional polish)

### Future evolution (saptamani-luni)

Vezi capitolele 4-7 mai jos.

---

## 3. Posibile implementări viitoare (post-hackathon)

### 3.1 Mainnet migration (timeline: Q3 2026)

Pași:
1. Generare admin keypair NOU pentru mainnet (offline)
2. Setup Helius mainnet endpoint ($29/lună plan)
3. Bootstrap Bubblegum tree pe mainnet (~0.05 SOL real)
4. Migrare metadata JSON la **Arweave via Bundlr** (storage permanent,
   ~$0.0005/asset) sau **Pinata IPFS** (free tier 1GB)
5. Update toate explorer URLs la mainnet (eliminate `?cluster=devnet`)
6. Audit securitate extern (~$3-5k pentru hackathon-grade audit)
7. Soft launch cu primele 100 figurine

### 3.2 Cross-chain V-DASH integration

V-DASH e pe MultiversX. HeroPad cNFTs sunt pe Solana. Două căi:

**Opțiunea A — Read-only oracle gateway (simplu):**
- HeroPad expune `/api/user/me?wallet=...` (deja există)
- V-DASH backend întreabă HeroPad când userul leagă wallet Solana în profilul
  V-DASH
- V-DASH rulează logică internă: dacă userul are cNFT X → unlock skin Y în joc

**Opțiunea B — Cross-chain bridge cu LayerZero / Wormhole:**
- Burn cNFT pe Solana → mint NFT echivalent pe MultiversX
- Reverse posibil
- Complex, audit risk, dar full interoperabilitate

Pentru Q4 2026 → Opțiunea A. Pentru 2027+ → poate Opțiunea B dacă scale-ul cere.

### 3.3 NFC hardware production

Stack pe care îl ai:
- RC522 module + Raspberry Pi pentru atelier (write codes la chip-uri)
- NTAG215 chips (~$0.30/buc en-gros, 504 bytes user data — suficient pentru URL)
- Sau NTAG-DNA pentru anti-cloning (mai scump, ~$2/buc, semnătură on-chip per scan)

Workflow producție:
1. Generezi N coduri în Supabase
2. Export CSV codes + signatures
3. Script Python cu RC522: pentru fiecare chip, scrie URL → marchează "used" în DB
4. Lipești chip pe figurină / card / pack
5. Production line ready

### 3.4 Marketplace integration

- Magic Eden listing cu royalty 5% enforced
- Tensor listing cu trait filters
- Hyperspace listing
- Eventual collection pe Solanart pentru EU users

Timeline: imediat după mainnet (Q3 2026).

---

## 4. Integrare Shopify (drop shipping) — fezabil, plan concret

**Da, putem face asta. E scenariul ideal de B2C.**

### Cum ar funcționa

1. Customer pune comandă pe `supervictornft.com` (Shopify) — figurină, card pack, etc.
2. **Shopify webhook** `orders/create` → endpoint nou la noi `/api/shopify/order`
3. Backend nostru:
   - Generează cod nou `HVPD-XXXX-XXXX` cu HMAC
   - Inserează în `collectibles_catalog` cu `shopify_order_id`, `distribution_channel='b2c_shopify'`
   - Returnează codul + URL claim
4. Shopify **fulfillment script** (la fabrică / depozit):
   - Fetch URL claim pe ecran / printer NFC
   - Scrie URL pe chip → lipește pe figurină
   - Imprimă QR code de backup pe etichetă
5. Customer primește figurina prin curier
6. Tap NFC sau scan QR → land pe HeroPad → claim → cNFT în wallet

### Cod necesar pentru asta (estimare 2-3h)

```typescript
// apps/api/src/routes/shopify.ts
import { Router } from 'express';
import { signPayload, isWellFormedClaimCode } from '../lib/hmac.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

export const shopifyRouter = Router();

// Webhook secret comes from Shopify admin → Notifications
shopifyRouter.post('/webhook/order', async (req, res) => {
  // 1. Verify Shopify HMAC header
  // 2. Parse order line items
  // 3. For each phygital product, generate code + sig
  // 4. Insert into collectibles_catalog with shopify_order_id
  // 5. Return URL list to fulfillment
});
```

Plus Shopify-side:
- Webhook configurat în Settings → Notifications
- Liquid template în post-purchase email cu QR code de backup
- Printable label template pentru fulfillment

### Cost estimat
- Dezvoltare: 2-3 zile
- Shopify Basic: $29/lună (sau gratis dacă deja ai)
- Fulfillment (NFC chip + writing): ~$0.50/figurină en-gros

### Avantaj
- Fluxul B2C complet automatizat
- Fiecare comandă Shopify = un cNFT bound to that customer
- Claim flow consistent cu B2B / events

---

## 5. Monetizare — 6 stream-uri concrete

### 5.1 B2B white-label phygital infrastructure (cea mai mare oportunitate)

**Pitch:** "Brand de jucării ai? Vrei să adaugi NFT layer la produse fără să
construiești team blockchain de la zero? White-label HeroPad."

- Clienți: Lego (improbabil dar visăm), Funko, Pop Mart, Hasbro tier 2,
  toy brands europene mai mici
- Pricing: $5-20k setup fee + $0.01-0.10 per cNFT mint (volume discount)
- Revenue example: 5 brands × 100k cNFTs/an × $0.05 = $25k/an + setup fees
- ROI pentru client: brand differentiation + secondary marketplace royalty

### 5.2 Marketplace royalty 5%

- Hardcoded la mint, enforced de Magic Eden default + Tensor + Hyperspace
- Pe 10k tranzacții secundare la $5 mediu/cNFT = $2,500/an pasiv
- La scale (100k tranzacții/an) = $25,000/an pasiv

### 5.3 Premium drops (limited Genesis editions)

- 4 drops/an × 1,000-10,000 editions × $5-25/edition
- Genesis edition collectibles cu artwork special, traits unice
- Pricing fixed (nu auction de la zero) ca să fie family-friendly

### 5.4 Sponsored collaborations

- Co-branded drops cu alți IP holders (anime, sport, music)
- Brand pays sponsorship fee + we share royalties
- Example: collab cu un anime studio japonez pentru drop limitat 5k editions

### 5.5 BITS economy + premium features

- BITS earned din claim → spent pe upgrade în V-DASH (free in-game economy)
- Optional: USDC purchase de BITS (premium currency) pentru users care nu vor
  să grindeze
- Tickets pentru evenimente / sezoane

### 5.6 Education / B2B partnerships

- Vezi capitolul 6 — orice utilizare educațională sau corporate vine cu
  contract licensing fee separat

### Estimate revenue total (Year 1 cu mainnet launch realist)

- B2B (2 mid-tier brands): $30,000
- Royalty marketplace (assuming 50k cNFTs in circulation): $5,000
- Premium drops (4 × 2,000 × $10): $80,000
- Sponsored collab (1 × $20k): $20,000
- BITS premium: $5,000

**Total Year 1 estimat: ~$140,000.** Y2 cu 5 brands + 100k cNFTs ar putea
să ajungă la $400-500k. Realist, conservativ.

---

## 6. 5 idei de aplicare în lume — bine social

### 6.1 Education — Carte de elev → cNFT certificat completare

**Cum:** Editura imprimă codul pe spatele cărții. Elevul finalizează cartea →
profesorul/părintele scanează → cNFT certificat în wallet (pe care universitatea
îl poate verifica la admitere).

**Beneficiar:** copii din zone defavorizate care n-au "transcript oficial"
recunoscut. cNFT-urile devin proof of completion immutable, recunoscute global.

**Model:** ONG + sponsor corporate care plătește mint costs.

### 6.2 Healthcare — Anti-counterfeit medication packaging

**Cum:** Fiecare cutie de medicament primește chip NFC + cod HMAC. Pacientul
scanează → vede pe wallet:
- Lot de fabricație
- Data expirării
- Locul de provenență (țară, fabrică)
- Verificat că NU e contrafăcut

**Beneficiar:** OMS estimează 1 din 10 medicamente în țări în curs de dezvoltare
sunt contrafăcute. cNFT pe blockchain = anti-counterfeiting cu cost mic.

**Model:** Pharma giants plătesc license fee per cutie (~$0.01-0.10).

### 6.3 Charity — Donation receipts immutable

**Cum:** ONG-ul vinde "tokens of impact" — donezi $10 pentru un copil cu nevoie
specială, primești cNFT cu poza copilului + povestea + traseul banilor.

**Beneficiar:** transparență radicală. Donatorii văd CONCRET unde merg banii,
ONG-ul nu poate falsifica retroactiv. Fundațiile cu credit-trust scăzut câștigă
înapoi încrederea.

**Model:** ONG plătește mint cost (~$0.0001/donație) + license fee anual.

### 6.4 Cultural heritage — Museum NFC stories

**Cum:** Fiecare obiect din muzeu primește chip NFC. Vizitatorul atinge cu
telefonul → cNFT cu poveste audio, video, AR overlay → keepsake permanent
al vizitei.

**Beneficiar:** muzee mici care vor să atragă audiență tânără. cNFT-urile pot
fi tradeable → flywheel: vizitatorii postează colecții pe rețele, atrag alți
vizitatori.

**Model:** Muzeul plătește setup fee + per-cNFT mint. Posibil revenue share
din royalty.

### 6.5 Sustainability — Ethical product authenticity

**Cum:** Brand de cafea organică / ciocolată fair-trade pune cod pe ambalaj.
Customer scanează → vede:
- Ferma de origine (foto + GPS)
- Certificate organic / fair-trade
- Carbon footprint
- Salariul fermierului (transparent)

**Beneficiar:** consumatori care vor să cumpere conștient + fermierii ai căror
muncă devine vizibilă.

**Model:** Brand etic plătește per-produs license fee. Posibil tier "premium
verified" pentru brands care vor sigiliu suplimentar.

---

## 7. Bonus — alte 3 idei la care m-am gândit

### 7.1 Concert tickets cu cNFT memorabilia

Bilet la concert = cod NFC pe wristband. Scanezi la sosire (entry validation)
→ după concert primești cNFT cu setlist, poze backstage, video clipuri rare.
Tradeable, dar valoare emoțională mare → fanii nu vând, colecționează.

**Cu cine:** parteneriat cu Untold / Electric Castle / orice festival mare RO.

### 7.2 Gaming achievements cross-platform

Joci Counter-Strike, Fortnite, V-DASH? Achievement-urile rămân captive în acel
joc. cNFT-uri achievement = portable. "Top 1% în CS:GO Q3 2026" → cNFT pe
wallet → recunoscut în alte jocuri pentru perks (skin avantaj, etc.).

### 7.3 Real estate proof-of-residence

Fiecare apartament din complex primește chip NFC la intrare. Rezident scanează
zilnic → cNFT acumulează zile prezență → folosit pentru:
- Discount comerciale în zonă (parteneriat cu mall, restaurante)
- Prioritate la facilități comune
- Valoare adăugată la revânzare apartament (proof istoric)

---

## 8. Concluzie — unde suntem

**Produsul HeroPad e LIVE și FUNCȚIONAL pe Solana devnet.** Tot ce trebuie
să fac judges să facă **MERGE** — să se logheze și să claim-uiască un cNFT —
funcționează acum pe `heropad.vercel.app`.

**Ce diferențiază HeroPad de alte hackathon submissions:**
1. **Real product, real brand.** Nu e un demo de o seară. SVU e firmă cu
   trademark EUIPO și produs deja lansat (V-DASH).
2. **Plug-in la un game existing.** Cross-product narrative bazat pe traction
   reală.
3. **Stack production-ready.** Auth Privy, frontend Vercel, backend Railway,
   DB Supabase, RPC Helius — toate provideri serioși, nu hack-uri.
4. **Securitate gândită.** HMAC, rate limiting, RLS, MPC custody, key export,
   GDPR/MiCA compliance.
5. **Scale economics.** $0.0001/mint = poți emite 1 milion de cNFT-uri pe
   $100. Niciun produs phygital nu are economics-ul ăsta pe alt chain.
6. **Roadmap credibil.** Nu promitem teleportare în 2027 — promitem mainnet
   în 6 luni cu 1000 figurine, integrare V-DASH în 9 luni, B2B în 12-18 luni.

**Dacă pierdem hackathon-ul,** e ok — produsul rămâne, momentumul rămâne. Dar
plănuim să câștigăm. 🚀
