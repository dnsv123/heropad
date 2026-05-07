# HeroPad — Demo Video Script

> Target length: **2 minutes 30 seconds**
> Format: 1920×1080, 30fps, MP4 H.264 (YouTube + Solana Frontier portal both accept)
> Tools: OBS Studio (free) for recording, DaVinci Resolve / CapCut (free) for cuts
> Voice: optional narration (English, calm, friendly tone) — alternatively text overlays
> Music: cinematic build-up at start, drop on claim moment, fade-out

---

## Pre-record checklist

- [ ] Logged in to `heropad.vercel.app` with one account
- [ ] Already minted 2-3 cNFTs (so collection isn't empty for the wide shot)
- [ ] Generated 1 NEW code (via `seed-codes.ts`) — saved Code + Sig in a text file
- [ ] Phantom (or Brave Wallet) installed in browser, with the wallet from above
- [ ] Network throttling **OFF** in DevTools (so demo feels snappy)
- [ ] Browser zoom 100%
- [ ] Hide bookmarks bar, extensions toolbar, profile selector
- [ ] Two browser windows open and arranged: the live site + Solana Explorer
- [ ] Have the NFC chip + phone ready if you're doing the physical scene
- [ ] OBS scene 1: full-screen browser · scene 2: phone screen mirror via QuickTime
      (Mac) or scrcpy (Android)

---

## Scene-by-scene script

### 00:00 — 00:08 · Hook (8s)

**Visual:**
SuperVictor character flying in from the right with a cape trail, lands in
the center over the dark navy background. HeroPad gradient wordmark fades in
beneath. Cyan glow pulses out behind the character.

**Text on screen (white, Space Grotesk, bottom):**
> *"What if every toy came with a digital twin?"*

**Voiceover (optional):**
> "Every kid wants their toy to mean something more. Today, that 'something'
> is a paper card."

---

### 00:08 — 00:25 · The problem (17s)

**Visual:**
Cut to a stack of toy boxes. Pull a paper "scan me" QR card out of one,
hold it up — text overlay points out what's wrong:
- "QR → 404 in 3 years"
- "NFTs cost $30 to mint"
- "Account dies when brand pivots"

Then cut to a montage:
- Solana logo
- Magic Eden / Tensor screenshots
- "$0.0001 per mint" overlay

**Voiceover:**
> "Today's phygital QR cards lead to dead links. Old NFT chains charge thirty
> dollars to mint. Solana made it cost a hundredth of a cent. That's the
> moment we built HeroPad."

---

### 00:25 — 00:40 · Brand intro (15s)

**Visual:**
SVU brand stack montage:
1. Super Victor logo (EUIPO trademark badge overlay)
2. V-DASH gameplay screenshot (from VDASH-GAME public/brand/)
3. Hall of Heroes UI screenshot
4. Quick cut to printed figurine prototype

**Voiceover:**
> "We're SuperVictor Universe. We've been building characters, games, and
> stories for kids since 2023. Our flagship game V-DASH has been live on
> MultiversX for two years. Our trademark is registered in the EU.
> HeroPad is our entry point to Solana."

---

### 00:40 — 01:30 · The live demo (50s)

**This is the core 50 seconds. Keep snappy.**

#### 00:40 — 00:50 — Landing page

Open `heropad.vercel.app` on desktop:
- Hero section with character + gradient title
- Pan slowly down to show How it works + Why Solana cards

**Voiceover:**
> "Here's what HeroPad looks like."

#### 00:50 — 01:00 — Login (Email or Google)

Click Login button. Privy modal opens. Click Google → choose account → return
logged in.

**Voiceover:**
> "Login is email or Google. Behind the scenes, Privy provisions a Solana
> wallet using MPC — no seed phrase, no friction."

#### 01:00 — 01:15 — Claim (the magic)

Switch to second browser window with the prepared claim URL pre-typed in
address bar:
```
https://heropad.vercel.app/claim?c=HVPD-XXXX-XXXX&s=...
```
Hit Enter. Auto-submit kicks in. Wait ~2 seconds. SUCCESS state appears.

**Voiceover (matched to timing):**
> "Now I scan a figurine — or in this case, click the QR's URL. Sign required —
> done. The code's HMAC is verified, the cNFT is minted, the user gets a hundred
> BITS reward. **Two seconds.** That's the entire claim flow."

#### 01:15 — 01:25 — Profile

Click "Go to my profile". Show:
- Wallet address with Copy + Export key buttons
- Linked accounts row
- Collection grid with cNFT thumbnails

**Voiceover:**
> "Here's the user's profile. Multiple wallets supported. Embedded keys
> exportable to Phantom anytime — fully non-custodial. Collection's right there."

#### 01:25 — 01:30 — Solana Explorer

Click on a cNFT card → modal opens → click "View on Solana Explorer".
Show the actual on-chain record with verified compression, owner address,
royalty 5%, our HeroPad symbol.

**Voiceover:**
> "This is real. On-chain. Solana. And every collectible carries a 5% creator
> royalty back to the brand on every secondary sale."

---

### 01:30 — 01:50 · V-DASH integration (20s)

**Visual:**
Cut to `/v-dash` page on HeroPad. Show:
- V-DASH wordmark
- Hero Skins / Hero Gear / BITS Rewards 3-card section
- Roadmap timeline

Then briefly cut to V-DASH game footage (use `public/brand/collections/vidsupvic-2.mp4`
from VDASH-GAME repo).

**Voiceover:**
> "But the cNFT is just the start. Each HeroPad collectible unlocks gameplay
> in V-DASH — skins, equipment in Chapter 2, and BITS multipliers across the
> whole SuperVictor ecosystem. The toy isn't a souvenir. It's a key."

---

### 01:50 — 02:15 · The vision (25s)

**Visual:**
Slowly pan over a board / mural showing future use cases:
- Education (textbook → cNFT certificate)
- Healthcare (medication anti-counterfeit)
- Cultural heritage (museum NFC stories)
- Sustainability (ethical product authenticity)
- Charity (donation receipts on-chain)

**Voiceover:**
> "HeroPad ships first as a SuperVictor product. But the same primitive —
> a signed code on a physical thing, redeemable as a Solana cNFT — works for
> education, healthcare, cultural heritage, sustainability, charity. We're
> building the toy. We're shipping the platform."

---

### 02:15 — 02:30 · Closing (15s)

**Visual:**
Cut back to Super Victor flying pose, gradient wordmark below. Below that,
URLs:
```
heropad.vercel.app
github.com/dnsv123/heropad
@SVictorUniverse
```

**Voiceover:**
> "HeroPad. Where physical heroes become digital superpowers. Live now on
> Solana devnet. Submitted to Solana Frontier 2026. Thank you."

Music drops, fade to black.

---

## Recording tips

1. **Record landing page once, then loop it.** Trying to do "natural mouse movement"
   across 2 minutes will be painful. Record 30 seconds of slow scrolling, cut.

2. **Pre-fill the claim URL** in a text editor, copy-paste into address bar.
   Don't type it live — too slow, too error-prone.

3. **For the success state**, record at native 30fps so the animation looks
   smooth. If you record at 60fps and export at 30fps you might get judder.

4. **Voiceover separately.** Record visuals first (silent), then add voice
   over in your editor. Way easier to time things this way.

5. **Music: use a free track from YouTube Audio Library or epidemicsound.com
   trial.** Avoid copyright issues. Suggested vibe: cinematic build (start),
   soft electronic (middle), gentle outro.

6. **Captions:** add English subtitles via your editor's auto-caption feature.
   Many judges watch on mute.

---

## Asset shopping list

From your existing files:
- `super-victor.png` — main mascot for hook
- `super-victor-fly-1.png` — closing shot
- `super-victor-pfp.png` — profile avatar
- VDASH-GAME `public/brand/collections/vidsupvic-2.mp4` — V-DASH gameplay clip
- VDASH-GAME `public/brand/logo/SuperVictor-Character.png` — brand intro
- Trademark certificate scan (if available) — overlay during "EUIPO registered"

To create:
- 5-second card for "education / healthcare / heritage / sustainability /
  charity" — could be 5 emoji or simple icons on the dark background
- HeroPad gradient wordmark with cape glow — looped 2-second animation

---

## Final delivery

- Export as MP4, 1920×1080, 30fps, ~50-100 Mbps bitrate
- Upload to YouTube as **unlisted** (so you have a stable URL)
- Drop the URL in the Solana Frontier submission form
- Save the .mp4 file in `docs/demo.mp4` (gitignore-d, large file)
- Tweet a 30-second teaser cut from @SVictorUniverse
