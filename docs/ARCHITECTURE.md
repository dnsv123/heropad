# Arhitectură HeroPad

## Viziune

HeroPad este un strat phygital care leagă obiecte fizice (figurine, carduri, ambalaj) de o identitate digitală pe Solana și de un joc browser-based (V-DASH). Fiecare obiect fizic devine "cheia" unui cNFT și a unui erou jucabil. Toate cele trei mecanisme converg într-un singur flow de claim, indiferent de canalul de distribuție.

---

## Cele 3 mecanisme de claim

### 1. Figurină NFC (B2C și B2B premium)
Fiecare figurină are un cip NFC pasiv programat cu un URL unic de forma `https://heropad.supervictornft.com/claim?c=<code>&s=<sig>`. Telefonul deschide tap-ul direct în browser, fără nicio aplicație instalată. Codul este unic pe figurină și semnat HMAC pe partea backend-ului, ca să nu poată fi falsificat.

### 2. Card QR (eveniment + B2B social)
Carduri tipărite (uneori incluse în pachete spitalicești sau evenimente) au un QR cu același format de URL. Util pentru distribuție rapidă, ieftină, fără hardware NFC.

### 3. QR pe ambalaj (B2C Shopify)
Ambalajul produsului fizic vândut pe Shopify are un QR similar. Codul este legat de comanda Shopify (`shopify_order_id` în `collectibles_catalog`), permițându-ne să mapăm achiziții la claim-uri reale.

---

## Flow unificat de claim

```
┌────────────┐  scan/tap  ┌────────────┐    POST /v1/claim     ┌─────────────┐
│  Obiect    │───────────▶│  Frontend  │──────────────────────▶│  API        │
│  fizic     │            │  (Privy    │   { code, signature,  │  Express    │
│  (NFC/QR)  │            │   auth)    │     scanMethod }      │             │
└────────────┘            └─────┬──────┘                       └──────┬──────┘
                                │                                     │
                                │ user logged in via Gmail            │
                                │ → wallet generat invizibil           │
                                ▼                                     ▼
                         ┌────────────┐                        ┌────────────┐
                         │  Privy     │                        │  Supabase  │
                         │  embedded  │                        │  (catalog, │
                         │  wallet    │                        │   claims)  │
                         └────────────┘                        └─────┬──────┘
                                                                     │
                                                            verify code unused,
                                                            verify HMAC sig
                                                                     │
                                                                     ▼
                                                              ┌────────────┐
                                                              │  Metaplex  │
                                                              │  Bubblegum │
                                                              │  (cNFT)    │
                                                              └─────┬──────┘
                                                                    │
                                                                    ▼
                                                              ┌────────────┐
                                                              │  Solana    │
                                                              │  Devnet    │
                                                              └────────────┘
```

Etape, în ordine:
1. **User scanează / tap-uiește.** URL-ul deschide `/claim?c=<code>&s=<sig>` în browser.
2. **Privy login.** Dacă nu e logat, Privy cere Gmail. Wallet-ul Solana este generat automat la primul login și asociat cu user-ul în Supabase (`solana_wallets`).
3. **Frontend trimite `POST /v1/claim`** către API cu `{ code, signature, scanMethod, deviceId? }` și access token-ul Privy.
4. **API validează:**
   - HMAC pe `code` cu `HMAC_SECRET` (server-side).
   - `code` există în `collectibles_catalog`.
   - `code` nu e deja claim-uit (`UNIQUE` constraint pe `claims.code`).
   - User-ul are wallet în `solana_wallets`.
5. **API mintează cNFT** prin Metaplex Bubblegum la wallet-ul user-ului (admin-ul plătește gas-ul pe devnet).
6. **API insertă** în `claims` și creditează BITS în `bits_transactions` + `bits_balance`.
7. **Frontend afișează success state** cu mint address + link Solana Explorer + CTA către V-DASH.

---

## Componente

| Componentă | Responsabilitate |
|------------|------------------|
| `apps/web` | Landing, onboarding, claim flow, profil, link spre V-DASH. |
| `apps/api` | Validare claim, mint cNFT, gestionare BITS, integrare Shopify webhook (viitor). |
| `packages/shared` | Tipuri TypeScript partajate (request/response, enums). |
| `packages/db` | Migrări Postgres pentru Supabase. |
| `Privy` | Auth Gmail + wallet Solana embedded (invizibil pentru user). |
| `Helius RPC` | Conexiunea la devnet (compresie cNFT necesită indexer-ul Helius). |
| `V-DASH` | Joc Phaser 3 existent, integrat ca rută/iframe; consumă cNFT-uri pentru deblocare eroi. |

---

## Decizii cheie

- **cNFT (compressed NFT) în loc de NFT clasic.** Costul per mint scade de ~100x, ceea ce face viabilă mintarea per figurină la scară.
- **Privy în loc de wallet adapter.** Target user (părinți, copii prin părinți, spitale) nu are Phantom. Login Gmail e mainstream.
- **Devnet în hackathon, mainnet după audit.** Nu vrem fonduri reale pe codul nedotat încă cu rate limiting / fraud detection.
- **HMAC pe cod, nu signature on-chain.** QR/NFC trebuie să meargă fără semnătură de wallet — semnătura HMAC e suficientă ca să previi cod ghicit/falsificat.

---

## TODO viitor

- [ ] Rate limit pe `/v1/claim` per IP + per device.
- [ ] Webhook Shopify pentru fulfilment automat (mapare comandă → batch coduri).
- [ ] Dashboard B2B pentru fundații/spitale (metrici scanări, geolocalizare anonimizată).
- [ ] Move la mainnet + audit.
