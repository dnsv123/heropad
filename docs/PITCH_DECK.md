# HeroPad — Pitch Deck

> 12 slides · ~90 seconds reading time per slide if presented live · ~5 min total
> Built for Solana Frontier hackathon submission · May 2026
>
> Convert to Google Slides / Pitch / Canva by copy-paste each slide as one
> page. Suggested aspect ratio: 16:9. Suggested fonts: Space Grotesk (titles),
> Inter (body). Brand colors: hero-blue `#1E5FBA`, hero-cyan `#5DD3FF`, hero-gold
> `#F5C842`, hero-deep `#0A1B3A`, solana-purple `#9945FF`.

---

## Slide 1 — Title

**HeroPad**

*Where physical heroes become digital superpowers.*

Phygital × Solana · Built by SuperVictor Universe · Solana Frontier 2026

[Visual: Super Victor flying-pose mascot on dark navy background with cyan
glow ring. Bottom-right: HeroPad wordmark in gold→cyan gradient.]

---

## Slide 2 — The problem

The toy industry sells $100B / year of physical collectibles.

The "digital companion" is almost always:
- A paper card with a QR going to a static webpage
- An NFT minted on a chain that costs $1+ per mint (kills unit economics)
- A username/password account that vanishes when the brand pivots

**Kids deserve better than a 404 in 5 years.**

[Visual: side-by-side — "today" (paper QR card) vs "tomorrow" (cNFT in wallet)]

---

## Slide 3 — The opportunity

Solana now ships compressed NFTs at **$0.0001 per mint**.

That's the **first chain economically viable** for a 1:1 phygital experience:
every figurine, every card, every product pack — its own on-chain twin.

| What | Then (Ethereum 2021) | Now (Solana 2026) |
|---|---|---|
| Mint cost | $30+ | $0.0001 |
| Confirmation | 30s–5min | <2s |
| Mobile-native wallet | Hard | Phantom + Privy MPC |
| Marketplace tooling | Mature | Magic Eden, Tensor, Hyperspace |

**Solana is the chain phygital toys were waiting for.**

---

## Slide 4 — Our solution

**HeroPad** — the on-chain entry point for the SuperVictor Universe.

1. **Scan** an NFC figurine, QR card, or pack
2. **Sign in** with email or Google (Privy MPC, no seed phrase)
3. **Claim** a Solana cNFT in <2 seconds
4. **Earn BITS** rewards
5. **Unlock** skins & gear in V-DASH (our existing game)

Live now: https://heropad.vercel.app · Solana devnet · 5+ cNFTs minted in dev

[Visual: 5-step flow with icons. Use the actual screenshots from the live site.]

---

## Slide 5 — Why we win

We're not building a phygital toy. **We already built one.**

- **V-DASH** — flagship game, live on MultiversX since 2024
- **Super Victor** — character with EUIPO-registered trademark (filing 019287298)
- **Active community** — Discord, Twitter @SVictorUniverse
- **Existing illustrator** — full character library (50+ poses, 4 outfits, 3 art styles)
- **Romanian SRL** — proper legal entity, contracts ready, MiCA-aware

HeroPad is **iteration #4** on the SuperVictor Universe stack — not a green-field
crypto experiment.

[Visual: timeline showing SVU history: 2023 brand, 2024 V-DASH on MultiversX,
2025 EUIPO trademark, 2026 HeroPad on Solana]

---

## Slide 6 — Live demo

[This slide is a placeholder — during pitch, switch to live demo.]

**60-second demo:**
1. Scan figurine (or paste URL on phone)
2. Email login
3. cNFT mints
4. Profile shows the collection
5. V-DASH preview page

Backup: 90-second video at https://heropad.vercel.app/demo (or YouTube)

---

## Slide 7 — Tech architecture

| Layer | Stack | Why |
|---|---|---|
| Frontend | Vite + React + Tailwind | Fast iteration, mobile-first, PWA-ready |
| Auth | Privy (MPC) | Web2 onboarding, no seed phrase to lose |
| Backend | Express + TypeScript on Railway | Standalone, scales horizontally |
| Database | Supabase (Postgres + RLS, EU) | Compliant, easy ops, real-time ready |
| Chain | Solana via Helius RPC | Fast, cheap, mobile-native wallets |
| NFTs | Metaplex Bubblegum (cNFT) | $0.0001/mint, marketplace-compatible |

**Security:** HMAC-signed claim codes · constant-time verify · DB-level
unique-on-code constraint · 30 req/min rate limiting · CORS allowlist · MPC
key custody · zero secrets in repo.

[Visual: architecture diagram from README, simplified for slide]

---

## Slide 8 — Business model

Three revenue streams from Day 1:

1. **B2B white-label** — other toy brands use HeroPad infrastructure to
   "phygital-ize" their products. License fee + per-cNFT mint fee.
   *Target: 5 partner brands by Q3 2026.*

2. **Secondary marketplace royalty** — 5% on every cNFT resale (Magic Eden,
   Tensor, Hyperspace honor royalties).
   *Target: 2-5% of total cNFT volume becomes recurring revenue.*

3. **Premium drops** — limited Genesis editions, seasonal collections,
   collaborative drops with other IP holders.
   *Target: 4 drops/year, 1k-10k editions each.*

Plus consumer revenue from existing SuperVictor figurines (Shopify drop-shipping,
B2B social distribution to hospitals/foundations).

---

## Slide 9 — Use beyond toys

The same primitive — NFC/QR + HMAC + Solana cNFT — generalizes to:

1. **Education** — textbook codes unlock learning content + on-chain
   completion certificates kids can show universities
2. **Healthcare** — anti-counterfeit medication packaging, with patient
   ownership of prescription history
3. **Cultural heritage** — museum artifacts with NFC stories, donation
   receipts as immutable proofs
4. **Sustainability** — product authenticity for ethical brands (organic,
   fair-trade verifiable on-chain)
5. **Charity** — every donation gets a cNFT receipt that resists
   organization-side data manipulation

HeroPad ships first as a SuperVictor product. The infrastructure becomes a
platform.

---

## Slide 10 — Roadmap

| When | What |
|---|---|
| **Now (May 2026)** | Solana devnet launch · open submission |
| **Q3 2026** | Mainnet · first 1,000 NFC figurines via Shopify · marketplace listing |
| **Q4 2026** | V-DASH Chapter 2: Hero Gear cNFT equipment · cross-chain skin sync |
| **2027** | B2B partnerships (3-5 brands) · season passes · Solana-native game mode |

Funding milestones aligned: hackathon prize → Q3 launch · $50-100k pre-seed →
Q4 Chapter 2.

---

## Slide 11 — The ask

We're applying for the **Solana Frontier hackathon prize**.

Use of funds:
- **40%** Illustrator retainer (3-6 months) — the artist who designed Super
  Victor, kept on the project
- **30%** Engineering (cross-chain bridge V-DASH ↔ HeroPad, mainnet audit)
- **20%** Production run #1 (1,000 figurines, NFC chips, packaging)
- **10%** Marketing (drops, community, conferences)

We're also open to **angel/seed investors** aligned with phygital + family
brands. Contact: dinescuioanvalentin@gmail.com.

---

## Slide 12 — Closing

**HeroPad turns every toy into an on-chain hero.**

- Real product, live now
- Real brand, real IP
- Real economics, real road to scale
- Built on the chain that makes it actually work

*Where physical heroes become digital superpowers.*

[Visual: large Super Victor flying with HeroPad gradient wordmark below.
Bottom: heropad.vercel.app · github.com/dnsv123/heropad · @SVictorUniverse]

---

## Speaker notes (mental cheat sheet)

If asked about competition:
- Pop Mart Pro (closed ecosystem, no chain), VeVe (centralized, expensive),
  RTFKT (acquired by Nike, paused). HeroPad is the only **open, kids-friendly,
  Solana-native** play.

If asked about regulation:
- MiCA exempts utility NFTs / collectibles. We're not a securities offering.
  Legal entity in EU, Romanian SRL, contracts ready. ToS + Privacy live on site.

If asked about the parent company:
- SVU Journey SRL, Bucharest. EUIPO-registered IP. Active products since 2023.
  This isn't a hackathon-only entity.

If asked "why not just one chain":
- V-DASH proved gameplay loop on MultiversX. Solana adds the consumer
  on-ramp (cheap mint, mobile wallet). Each chain plays to its strength;
  the bridge is on the roadmap.
