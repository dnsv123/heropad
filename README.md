# HeroPad 🦸

> **Where physical heroes become digital superpowers**

Un ecosistem phygital construit pe Solana care leagă figurine NFC, carduri QR și ambalaj scanabil de cNFT-uri reale și de un joc browser-based (V-DASH). Pentru părinți pe Shopify și pentru spitale/fundații prin distribuție B2B socială.

🌐 **Live demo:** https://heropad.supervictornft.com *(placeholder, în deploy)*
🎬 **Demo video:** TBD
📊 **Pitch deck:** TBD
🐦 **Twitter / X:** TBD

---

## 🩹 Problema

Copiii primesc jucării și colecționabile în fiecare zi, dar valoarea lor afectivă moare în câteva săptămâni. Părinții nu au cum să transforme aceste momente fizice în amintiri digitale durabile, iar brandurile nu pot măsura sau recompensa loialitatea reală a fanilor. În paralel, spitalele și fundațiile distribuie figurine terapeutice fără un strat digital care să prelungească conexiunea cu copilul.

## ⚡ Soluția

HeroPad transformă fiecare obiect fizic — figurine NFC, carduri QR, ambalaj cu QR — într-un cNFT pe Solana, claim-uit într-un wallet generat invizibil prin Privy (login Gmail). cNFT-ul deblochează un erou jucabil în V-DASH (joc Phaser 3) și acumulează BITS, moneda internă a ecosistemului. Distribuția duală — B2C prin Shopify și B2B social către spitale și fundații — face ca fiecare scanare să conteze pentru cineva.

---

## 🏗️ Arhitectură (high-level)

```
┌──────────────┐   scan / tap   ┌──────────────┐   POST /claim   ┌────────────────┐
│  Figurină    │────────────────▶│              │────────────────▶│                │
│  NFC / QR    │                 │   Frontend   │                 │   API Express  │
│  Card / Pack │                 │  Vite+React  │◀────────────────│  (Solana admin │
└──────────────┘                 │  Privy auth  │   cNFT minted   │   + Metaplex   │
                                 └──────┬───────┘                 │   Bubblegum)   │
                                        │                         └────────┬───────┘
                                        │                                  │
                                        ▼                                  ▼
                                 ┌──────────────┐                  ┌──────────────┐
                                 │  Supabase    │                  │   Solana     │
                                 │ (Postgres +  │                  │   Devnet     │
                                 │  Auth + RLS) │                  │  via Helius  │
                                 └──────────────┘                  └──────────────┘
                                        │
                                        ▼
                                 ┌──────────────┐
                                 │   V-DASH     │
                                 │  Phaser 3    │
                                 └──────────────┘
```

Detalii: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## 🧰 Stack tehnic

- **Frontend:** Vite + React + TypeScript + Tailwind + Framer Motion
- **Auth:** Privy SDK (Gmail login → Solana wallet auto-generat, invizibil pentru user)
- **Backend:** Express + Node.js (TypeScript)
- **DB:** Supabase (Postgres + Auth + RLS)
- **Solana:** `@solana/web3.js` + Metaplex Bubblegum SDK pentru cNFT pe **devnet**
- **RPC:** Helius (devnet)
- **Hosting:** Vercel pentru frontend
- **Joc:** Phaser 3 (V-DASH, modul existent integrat)

---

## 📦 Structura monorepo

```
heropad/
├── apps/
│   ├── web/          # Frontend Vite + React
│   └── api/          # Backend Express + TypeScript
├── packages/
│   ├── shared/       # Tipuri partajate
│   └── db/           # Migrări SQL Supabase
└── docs/             # Pitch, arhitectură, roadmap
```

---

## 🚧 Status

> 🛠️ **Building for Solana Frontier Hackathon** — deadline **11 mai 2026**.
> Următor: **Bags Hackathon** — deadline **1 iunie 2026**.

Roadmap-ul detaliat: [`docs/ROADMAP.md`](./docs/ROADMAP.md).

---

## 🚀 Quick start (dev)

> **Notă:** dependențele NU sunt instalate în acest commit. Le instalezi local când ești gata.

```bash
# 1. Clonează
git clone https://github.com/dnsv123/heropad.git
cd heropad

# 2. Setează env vars
cp .env.example .env
# completează manual valorile

# 3. Instalează (workspace-aware)
npm install

# 4. Dev
npm run dev          # pornește web + api în paralel
```

Detalii deploy: [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

---

## 📄 License

MIT — vezi [`LICENSE`](./LICENSE).

---

*Built with ❤️ by the SuperVictor Universe team.*
