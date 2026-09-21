# HeroPad — Architecture notes (code audit)

Audit date: 2026-09-21. Branch `feature/solana-frontier`, HEAD `1f7d19f`.
Scope: only what is in the tracked source of this repository. Every claim cites
the file it comes from. Paths are relative to the repo root. Anything that is
planned, referenced in comments, or only in the README is listed separately in
section J. Anything that cannot be determined from code is marked "unclear
from the code" and repeated in section K.

Terminology: "trophy" and "collectible" mean a compressed NFT minted as a
loyalty memento. The code never sells, prices, or transfers them, and there is
no marketplace integration in this repo. They are collectible loyalty items.

Verified negatives:

- There is no MultiversX code in this repo. The string appears only in comments
  (`packages/db/migrations/003_loyalty_lean.sql`, `apps/web/src/pages/Play.tsx`
  line 7) and in the README roadmap. No dependency, client, or route targets it.
- `_private/` exists locally, is listed in `.gitignore`, and is not cited here.
- There are no automated tests in the repo (`git ls-files` matches only
  `.github/workflows/db-restore-test.yml` and a seed file).

---

## A. Component inventory

### Runtime services

| Component | Role | Files that use it |
|---|---|---|
| Vercel | Hosts the Vite/React SPA (`apps/web`). SPA rewrite for every path except `/api/`. Security headers. | `vercel.json` |
| Railway | Hosts the Express API (`apps/api`). Nixpacks build, `node dist/index.js`, health check `/healthz`. | `apps/api/railway.json`, `apps/api/src/index.ts` |
| Supabase (Postgres) | The only data store. Accessed exclusively with the service-role key from the API; every table is RLS-enabled with a service-role-only policy. | `apps/api/src/lib/supabase-admin.ts` (client), all `apps/api/src/lib/*-db.ts`, `packages/db/migrations/*.sql` |
| Privy | Web auth (email, Google, external Solana wallet) and embedded Solana wallet provisioning. Server-side token verification. | `apps/web/src/lib/privy.ts`, `apps/web/src/lib/auth.tsx`, `apps/web/src/lib/auth-sdk.tsx`, `apps/api/src/middleware/auth.ts` |
| Solana RPC (Helius) | Transaction submission for mints and the DAS `getAssetsByOwner` call. One URL (`SOLANA_RPC_URL`) serves both. | `apps/api/src/lib/solana-admin.ts`, `apps/api/src/lib/helius.ts`, `apps/api/src/index.ts` (`rpcCluster()`) |
| Metaplex Bubblegum / Umi | cNFT minting (`mintV1`) into one Merkle tree owned by the admin keypair; tree creation script. | `apps/api/src/lib/metaplex.ts`, `apps/api/src/lib/solana-admin.ts`, `apps/api/scripts/create-tree.ts` |
| Oblio | Romanian invoicing API. Hand-rolled client, dry-run by default. | `apps/api/src/lib/oblio.ts`, `apps/api/src/routes/billing.ts` |
| GitHub Actions | Four scheduled jobs: billing cron, nightly DB backup, monthly restore test, Supabase keep-alive. No build/test/deploy workflow. | `.github/workflows/billing.yml`, `db-backup.yml`, `db-restore-test.yml`, `keepalive.yml` |
| Vercel Analytics | Cookieless page analytics component. | `apps/web/src/App.tsx` |

Resend: not present. The only mentions are in the internal admin guide text
(`apps/web/src/components/AdminGuide.tsx` lines 549, 653) as a future email
provider. No dependency, no code.

### Notable dependencies present but unused in code

- `jsonwebtoken` (`apps/api/package.json`) — no import in `apps/api/src`.
  `JWT_SECRET` in `.env.example` is likewise unused.
- `@supabase/supabase-js` in `apps/web/package.json` — no import in
  `apps/web/src`. The web bundle never talks to Supabase directly.
- `apps/web/src/services/nfcService.ts` (Web NFC reader) — not imported by
  any page or component. The NFC path relies on the phone OS opening the
  tag's URL, not on in-page NFC reading.
- `apps/api/src/routes/mint.ts` — `POST /api/mint` returns 501
  `not_implemented`.

### API surface (mount points, `apps/api/src/index.ts`)

`/healthz`, `/api/admin` (+ `/api/admin/billing`, `/api/admin/rewards`),
`/api/billing` (cron), `/api/rewards`, `/api/claim`, `/api/loyalty`,
`/api/mint`, `/api/partner`, `/api/user`. Body limit 256 KB, `helmet()`,
`trust proxy` = 1.

---

## B. End-to-end path of a stamp

### 1. Physical trigger

- NFC figurine: the tag is programmed with the venue's loyalty URL carrying
  `?tap=1`. The only description of the tag content is in
  `apps/web/src/lib/plans.ts` line 81 ("sticker NTAG424 scris pe URL-ul
  localului (?tap=1)") and the comment block in `apps/api/src/routes/loyalty.ts`
  lines 1055–1062. No chip cryptography (SUN/CMAC) is used; the comment says so
  explicitly. The exact NDEF layout written to the tags is unclear from the
  code.
- QR at the counter: the venue's `/loyalty/<slug>` URL. The customer's own
  code is also rendered as a QR (`HPC:<code>`) and the redeem code as
  `HPR:<code>` (`apps/web/src/pages/Loyalty.tsx` lines 283–307).

### 2. Customer phone (`apps/web/src/pages/Loyalty.tsx`)

- Route `/loyalty/:slug` (`apps/web/src/App.tsx`). Slug constrained to
  `^[a-z0-9-]{2,60}$`, default `cafe-victor` (`Loyalty.tsx` lines 73–76).
- Public venue card: `GET /api/loyalty/venue/:slug` (no auth). Returns an
  allowlisted subset of `venues.branding`, happy-hour state, and time zone
  (`apps/api/src/routes/loyalty.ts` lines 668–723).
- Login via Privy bridge (`apps/web/src/lib/auth.tsx`). If the account has no
  Solana wallet, the page calls `createWallet()` once (`Loyalty.tsx` lines
  112–121).
- Check-in announcement: when `?tap=1` is present and the user is
  authenticated, one `POST /api/loyalty/me/:slug/checkin` with a Bearer token
  (`Loyalty.tsx` lines 151–176).
- Progress polling: `GET /api/loyalty/me/:slug?wallet=<addr>` every 4 s while
  the tab is visible, plus on focus/visibility change (`Loyalty.tsx` lines
  25, 252–281, 359–381). The response drives the meter, the "stamp landed"
  animation and the "card completed" celebration (detected by comparing
  `stamps` / `cardsCompleted` with the previous poll).

### 3. Check-in store (API, in-memory)

`apps/api/src/routes/loyalty.ts` lines 1064–1141:

- `checkinsByVenue: Map<venueId, CounterCheckin[]>` — process memory, not the
  database. TTL 3 minutes, at most 15 entries per venue, 30 s refresh floor per
  identity. Lost on API restart. Assumes one API instance.
- `POST /me/:slug/checkin` requires `requireAuth`; stores `{identityId,
  code, at}`.
- `GET /merchant/:slug/checkins` requires `requireAuth` and
  `loadCounterVenue` (owner or active staff). Returns codes with `secondsAgo`.
- `clearCheckin()` removes the entry when a stamp is granted (line 1874).

### 4. Barista counter (`apps/web/src/pages/Business.tsx`)

- Route `/business?venue=<slug>`; role probe `GET /api/loyalty/merchant/:slug/me`
  returns `owner` | `staff` | `none` (`Business.tsx` lines 256–274; API lines
  1393–1420).
- Check-in poll every 5 s while visible: `GET /merchant/:slug/checkins`. When
  the counter is idle (no customer loaded, empty input) the newest code is
  auto-loaded once (`Business.tsx` lines 159–210).
- Lookup: `GET /api/loyalty/merchant/:slug/customer/:code` → `findIdentityByCode`
  → `getVenueProgress` → `birthdayToday` boolean → pending BITS reward claims
  for this venue (API lines 1711–1760). The counter never receives email,
  wallet or birthday date.
- QR scanning uses `BarcodeDetector` with a `jsQR` fallback
  (`apps/web/src/components/QrScanner.tsx`).

### 5. Grant endpoint — `POST /api/loyalty/merchant/:slug/grant`

`apps/api/src/routes/loyalty.ts` lines 1762–1903. Middleware and checks, in
order:

1. Router rate limit 120 req/min per IP (lines 91–105).
2. `requireAuth` (`apps/api/src/middleware/auth.ts`): Privy
   `verifyAuthToken`, sets `req.privyId`.
3. `loadCounterVenue`: venue must exist and be `active`; caller must be
   `venues.owner_identity_id` or hold an active `venue_staff` seat (lines
   601–623). The acting identity id becomes `granted_by`.
4. Body via zod: `code` (`^[A-Z2-9]{6}$`), `count` 1..5, optional `requestId`
   (8..64 chars).
5. Idempotency: `claimRequestId('grant:<venueId>:<requestId>', 'grant')`
   inserts into `idempotency_keys` (PK on `key`). A duplicate returns the
   current progress with `duplicate: true` and grants nothing (lines
   1805–1824; `apps/api/src/lib/loyalty-db.ts` lines 1326–1334; migration 010).
6. Self-grant block: customer identity == acting identity → 403 (line 1828).
7. Happy hour multiplier decided server-side from `venues.branding.happyHour`
   in `venues.timezone` (`happyHourMultNow`, lines 480–515). Multiplier 2 or 3.
8. Daily cap: `MAX_STAMPS_PER_DAY` default 15 (env `LOYALTY_DAILY_CAP`, fails
   closed on bad values, lines 113–116) × multiplier. Counted with
   `countStampsToday` on `stamps.stamp_day`, live rows only (`loyalty-db.ts`
   lines 452–466). `stamp_day` is a generated UTC date column (migration 003),
   so the cap day is UTC, not the venue's zone.
9. Insert: `grantStamps` writes `count × multiplier` rows into `stamps` with
   `source = 'merchant'`, `granted_by = actingIdentity` (`loyalty-db.ts` lines
   470–485). The `'ntag_tap'` source value exists in the check constraint
   (migration 004) but is never written by the API.
10. Off the response path (`void …`): `runPassportAwards`, `runReferralAward`,
    `clearCheckin`, and per-stamp BITS (`STAMP_BITS_REWARD`, default 2, only if
    the customer has `solana_wallet`) written to `bits_transactions` with
    reason `stamp`.
11. Response: `granted`, `happyHour`, `stamps`, `required`, `canRedeem`.

Offline: the counter generates `requestId` once per tap
(`apps/web/src/services/offlineQueue.ts` `newRequestId`). On a network
failure the grant is queued in `localStorage` (`heropad:offline-queue`, 12 h
max age) and replayed with the same id on `online` and every 20 s
(`Business.tsx` lines 439–508). Only grants are queued; redemptions are not.

### 6. Balance

`getVenueProgress` (`loyalty-db.ts` lines 342–375): `current = count(live
stamps at venue) − sum(rewards_redeemed.stamps_consumed at venue)`, clamped
at 0. There is no per-card row; a "card" is this arithmetic.

### 7. Revoke — `POST /api/loyalty/merchant/:slug/revoke`

API lines 1905–1985. Owner or staff. Body `code`, `count` 1..2. Loops
`revokeLatestStampToday`: selects the newest live stamp from today (UTC) for
that customer at that venue and sets `revoked_at` / `revoked_by` with a
conditional update so two concurrent corrections cannot revoke the same row
(`loyalty-db.ts` lines 504–533; migration 013). Nothing is deleted. BITS
clawback of `−removed × STAMP_BITS_REWARD` with reason `stamp_revoked`.

### 8. Attribution and audit for owners

- `GET /merchant/:slug/history` (owner only): every stamp, revoke and reward
  with the customer's anonymous code and the granter shown as `owner`, the
  staff `display_name`, or `staff` — never the staff member's own loyalty code
  (`loyalty-db.ts` lines 1118–1268, comment at 1202–1206).
- `GET /merchant/:slug/staff` (owner only): per-seat `granted30d`,
  `revoked30d`, `grantedToday` (`apps/api/src/lib/staff-db.ts` lines 196–238).

---

## C. End-to-end path of a reward claim and cNFT mint

### 1. Customer requests a one-time redeem code

`POST /api/loyalty/me/:slug/redeem-code` (`loyalty.ts` lines 1147–1172),
`requireAuth`. Refuses with 409 `not_enough_stamps` unless
`progress.current >= venues.stamps_required`. Then `createRedeemCode`
(`loyalty-db.ts` lines 600–649):

- TTL 5 minutes (`REDEEM_TTL_MS`).
- Code: 6 chars from a 31-symbol alphabet (no 0/O/1/I/L) generated with
  `crypto.randomInt` (lines 111–128). Same generator as loyalty codes.
- First, the customer's own expired unused codes at that venue are marked
  `used_at`; then one insert. Uniqueness is enforced by two partial indexes:
  `uq_redeem_codes_active` on `(code) where used_at is null` (migration 005)
  and `uq_redeem_codes_live_per_card` on `(user_identity_id, venue_id) where
  used_at is null` (migration 012). On `23505` the existing live code is
  returned, so a double tap yields the same code.
- The phone shows the code, a `HPR:<code>` QR and a countdown; polling clears
  it once `cardsCompleted` increases (`Loyalty.tsx` lines 269–271, 325–357).

### 2. Merchant redeems — `POST /api/loyalty/merchant/:slug/redeem`

`loyalty.ts` lines 2007–2157. Owner or staff (`loadCounterVenue`). Steps:

1. `findValidRedeemCode(code, venueId)`: unused, unexpired, this venue
   (`loyalty-db.ts` lines 652–666). Otherwise 404 `invalid_redeem_code`.
2. Self-redeem block (403).
3. Re-check `progress.current >= stamps_required` (409 otherwise).
4. `markRedeemCodeUsed(id)`: conditional update `where used_at is null`
   (lines 674–683). This is the single serialization point; a loser gets 409
   `code_already_used`.
5. `redeemReward`: insert into `rewards_redeemed` with `stamps_consumed =
   stamps_required` and `reward_type` = snapshot of `branding.reward` (lines
   535–553, 2063–2074).
6. Trophy decision, in order:
   - no `user_identity.solana_wallet` → skipped, message says it will be
     mintable later (no self-heal via Privy here, unlike passport/referral);
   - `countTrophiesTodayGlobal() >= MAX_TROPHIES_GLOBAL_DAY` (default 300,
     env `TROPHY_GLOBAL_DAILY_CAP`) → skipped, `console.error`;
   - `countTrophiesToday(venue) >= MAX_TROPHIES_PER_VENUE_DAY` (default 50,
     env `TROPHY_DAILY_CAP`) → skipped;
   - `reserveTrophyMint(rewardId)`: conditional set of
     `rewards_redeemed.trophy_attempted_at where null` (lines 440–449;
     migration 013). Counting attempts, not completions, is what makes the
     caps count in-flight spend (comment at 384–392).
7. `mintCnftToWallet({ recipient, name: "SV Trophy — <venue> #<edition>"
   (sliced to 32), symbol: "SVTROPHY", uri: TROPHY_METADATA_URI ??
   "https://heropad.vercel.app/cnft/trophy.json" })`. Edition =
   `cardsCompleted` after this redemption.
8. `setRewardTrophy`: writes `trophy_asset_id` and `milestone_mint_tx`
   (base58 signature) back to the row.
9. BITS: `creditBits(wallet, TROPHY_BITS_REWARD (default 1000),
   'loyalty_trophy', {...})`.
10. Mint failure never fails the redemption; `trophySkipped` explains.

### 3. The mint itself (`apps/api/src/lib/metaplex.ts`)

- Umi with `mplBubblegum()` and `keypairIdentity(admin)` from
  `apps/api/src/lib/solana-admin.ts`. The admin keypair comes from
  `SOLANA_ADMIN_PRIVATE_KEY` (base58 or JSON byte array); only the public key
  is logged.
- Tree: `BUBBLEGUM_TREE_ADDRESS` env if set, else `solana_config.bubblegum_tree`
  (migration 002). Created once by `apps/api/scripts/create-tree.ts` with
  `maxDepth 14`, `maxBufferSize 64`, `public: false` (capacity 2^14 = 16,384
  leaves). `canopyDepth` is not passed; the library default applies — value
  unclear from the code.
- `mintV1` metadata: `sellerFeeBasisPoints` default 500 (a metadata field;
  nothing in this repo lists or sells assets), `collection: { key:
  '11111111111111111111111111111111', verified: false }` — i.e. no verified
  collection, `creators: [admin, verified: true, share 100]`. Confirmed at
  `confirmed` commitment.
- Asset id: `parseLeafFromMintV1Transaction` first; fallback reads
  `fetchMerkleTree(...).tree.sequenceNumber − 1` and derives
  `findLeafAssetIdPda`. The fallback is described as "bulletproof" in the
  comment but reads global tree state after the fact, so under two concurrent
  mints it can attribute the wrong leaf. See H.
- Off-chain metadata is static JSON served by the web app:
  `apps/web/public/cnft/trophy.json`, `passport-{bronze,silver,gold}.json`,
  `super-victor.json`. `trophy.json` points at `cnft/trophy-starter.png`
  (tracked). The passport JSONs point at `/loyalty/passport/*_round_medal.png`
  and `super-victor.json` at `/super-victor.png`; only `.webp` variants of
  those files are tracked. `claim.ts` line 120 defaults to
  `cnft/placeholder.json`, which does not exist in `apps/web/public`.

### 4. Which cluster

No cluster is hard-coded in the API. `rpcCluster()` in `index.ts` derives
`devnet` / `mainnet` / `unknown` from the hostname of `SOLANA_RPC_URL` (falls
back to `VITE_SOLANA_RPC_URL`) and reports it on `/healthz`. Explorer links in
the web use `VITE_SOLANA_CLUSTER` (default `devnet`,
`apps/web/src/lib/explorer.ts`). README labels the tree address as devnet.
Which cluster the production Railway service points at today is unclear from
the code.

### 5. Passport trophies (same pipeline)

`runPassportAwards` (`loyalty.ts` lines 291–371) runs after every grant and
when `GET /me/passport` is opened. Tiers 3/5/8 distinct venues
(`apps/api/src/lib/passport-db.ts`). Reservation = insert into
`passport_awards` with `UNIQUE (user_identity_id, tier)` (migration 016);
retry re-arms only after a 10-minute cooldown. Name `SV Passport — <Tier>`,
symbol `SVPASS`, uri `PASSPORT_METADATA_URI_<TIER>` ?? `cnft/passport-<tier>.json`.
BITS 250/500/1000 (`PASSPORT_BITS_*`). Counts into the same global daily cap.

### 6. Figurine claim (`POST /api/claim`, `apps/api/src/routes/claim.ts`)

A separate, older flow: HMAC-signed code `HVPD-XXXX-XXXX:<hex>` verified with
constant-time compare (`apps/api/src/lib/hmac.ts`), lookup in
`collectibles_catalog`, `claims` unique-on-code insert, mint via the same
`mintCnftToWallet`, 100 BITS. No `requireAuth`; the recipient wallet comes
from the request body. Rate limit 30/min per IP. Demo codes come from
`apps/api/scripts/seed-codes.ts`. The landing page marks "Claim a hero" as
"Coming soon" (`apps/web/src/components/Ecosystem.tsx` line 60) although the
route works.

### 7. Retro-mint script (`apps/api/scripts/retro-mint-trophies.ts`)

Selects `rewards_redeemed` rows with `trophy_asset_id IS NULL`, mints for
customers who now have a wallet, updates the row, credits BITS with reason
`loyalty_trophy_retro`. It does not call `reserveTrophyMint`, does not check
`trophy_attempted_at`, and ignores both daily caps. Run manually with the root
`.env`.

---

## D. Auth and identity model

### Web (`apps/web/src/lib/auth.tsx`, `auth-sdk.tsx`, `privy.ts`)

- `main.tsx` mounts `AuthProvider` without importing Privy. `auth.tsx` serves
  stub `usePrivy()` / `useSolanaWallets()` values and lazy-loads the real SDK
  chunk (`auth-sdk.tsx`, deliberately not named "privy" to dodge tracker
  blocklists) when: the route is not `/`, a `privy:*` key exists in
  `localStorage`, or any auth method is called. Calls made before the SDK is
  ready park on a promise (`sdkReady`). An error boundary retries once, a 20 s
  watchdog opens the gate, and a banner offers manual retry.
- Privy config (`privy.ts`): `loginMethods: ['email','google','wallet']`,
  `walletChainType: 'solana-only'`, `embeddedWallets.createOnLogin:
  'users-without-wallets'`, `shouldAutoConnect: false`, privacy/terms URLs
  passed to the login modal.
- The token sent to the API is `usePrivy().getAccessToken()`, attached as
  `Authorization: Bearer` by `apps/web/src/services/apiClient.ts`.

### API verification (`apps/api/src/middleware/auth.ts`)

- `PrivyClient(PRIVY_APP_ID ?? VITE_PRIVY_APP_ID, PRIVY_APP_SECRET)`.
  `requireAuth` calls `verifyAuthToken(token)` and sets `req.privyId =
  claims.userId` (the Privy DID). Any failure → 401.
- `getUserSolanaWallets(privyId)`: Privy `getUser` → linked accounts of type
  `wallet` with `chainType === 'solana'`. Used wherever a wallet must be proven
  to belong to the caller (`/api/user/me`, wallet hint on `/me/:slug`,
  passport/referral self-heal, GDPR erase).
- `getPrivyUserContact(privyId)`: email from linked `email` or `google_oauth`
  account. Used only by admin support and marketing consent.

### `user_identity` (migrations 003, 004, 007, 017, 018)

Columns actually used: `id`, `privy_id` (unique), `solana_wallet` (a cache,
see below), `loyalty_code` (6 chars, partial unique index), `marketing_consent`,
`marketing_consent_at`, `marketing_consent_version`, `marketing_email`,
`birthday_day`, `birthday_month`, `birthday_set_at`, `referred_by`,
`referred_at`, `referral_rewarded_at`, `created_at`. Columns present but
never referenced by the API: `email_encrypted`, `gmail`, `mvx_wallet`,
`phantom_wallet` (migration 003 "DEFERRED").

### Matching a user across logins

`ensureIdentity(privyId, wallet?)` (`loyalty-db.ts` lines 135–191) is the only
path: find by `privy_id`, else insert (retrying on loyalty-code collision). One
Privy DID = one identity row. Linking a second login method to the same DID is
done inside Privy (`linkEmail` / `linkGoogle` / `linkWallet` in
`ProfileWallet.tsx`); HeroPad does no email- or wallet-based matching of its
own.

### Wallet binding

`user_identity.solana_wallet` is written once, from the first of: a `?wallet=`
hint on `GET /me/:slug` that Privy confirms belongs to the caller
(`loyalty.ts` lines 973–994); or the passport/referral self-heal that asks
Privy for the first Solana wallet (lines 216–225, 297–305). The admin erase
path unions the cached column with Privy's list because the cache can be
empty (`admin.ts` lines 649–672).

### What HeroPad never holds

- User private keys. The web app only calls Privy's `createWallet()` and
  `exportWallet({ address })` (`apps/web/src/components/ProfileWallet.tsx`).
  The API never sees key material. The `solana_wallets.encrypted_private_key`
  column from migration 001 has no reader or writer in `apps/api/src`.
- The one key HeroPad does hold is its own admin keypair
  (`SOLANA_ADMIN_PRIVATE_KEY`), which owns the tree and pays for every mint.

### Roles

- Admin: `ADMIN_PRIVY_IDS` comma-separated allowlist; empty list = nobody
  (`admin.ts` lines 52–78). Every `/api/admin/*` route (including billing and
  rewards admin sub-routers) sits behind `requireAuth, requireAdmin`.
- Venue owner: `venues.owner_identity_id`, set by `POST
  /api/loyalty/venue/:slug/claim-ownership` with an 8-char setup code
  (`venues.claim_token`, 14-day `claim_expires_at`, partial unique index —
  migrations 006, 011). Two atomic paths: match slug+token, then token-only
  (`admin.ts` lines 1257–1317). Guarded by `claimAttemptLimiter` (10/hour keyed
  on the Privy DID, else IP with IPv6 collapsed to /64 —
  `apps/api/src/middleware/claim-limit.ts`).
- Staff: `venue_staff` rows created by the owner with an 8-char
  `claim_token`, 48 h TTL; `POST /api/loyalty/staff/claim` binds the caller's
  identity with a conditional update (`staff-db.ts` lines 139–155). Seat count
  enforced against `venues.staff_seats` (default 2). Roles `staff` |
  `manager` are stored; the code grants `manager` no extra permissions. Staff
  may grant, revoke, redeem, fulfil BITS rewards, and read `today` and
  check-ins; only the owner reads stats, history, settings and the team list.
- Partner: `partners` rows with an 8-char `claim_token`, 14-day TTL; `POST
  /api/partner/claim` binds one identity per partner; `GET /api/partner/me`
  returns only venues with `referred_by = partner.id` and derived commission
  (`apps/api/src/lib/partners-db.ts`).
- Multi-hat discovery: `GET /api/loyalty/me/roles` lists owned venues, staff
  seats, and partner status.

---

## E. Data model summary

All tables are in `public`, RLS enabled, single `service_role` policy (the
web never queries Supabase). Migrations are applied by hand in the Supabase
SQL editor (`packages/db/README.md`); there is no migration runner.

| Table | Purpose | Key columns / indexes |
|---|---|---|
| `venues` (003, 006, 008, 009, 011, 015, 022, 023) | A café. | `slug` unique; `stamps_required`; `branding` jsonb (reward, icon, logo data-URL, accent, tagline, contact, happyHour, announcement*, orderUrl, reviewUrl); `owner_identity_id`; `claim_token` + `claim_expires_at` (partial unique); `timezone`; `monthly_fee`, `billing_status` (trial/active/paused/cancelled), `billing_period` (monthly/annual), `paid_since`, `plan`, `addons`, `staff_seats`, `referred_by → partners`. `nfc_secret`, `tier` unused. |
| `user_identity` (003+) | One row per Privy DID. | See D. `uq_user_identity_loyalty_code` partial unique. |
| `stamps` (003, 004, 013) | One row per stamp. | `user_identity_id`, `venue_id`, `source` (check: nfc/qr/merchant/ntag_tap), `granted_by`, `created_at`, generated `stamp_day` (UTC), `revoked_at`, `revoked_by`. Indexes per user, per venue, and `idx_stamps_venue_live` partial on live rows. `fraud_score` unused. |
| `rewards_redeemed` (003, 005, 013) | One row per consumed card. | `stamps_consumed`, `reward_type` (label snapshot), `trophy_asset_id`, `milestone_mint_tx`, `trophy_attempted_at` (reservation), `redeemed_at`. |
| `redeem_codes` (005, 012) | 5-minute proof-of-presence codes. | `code`, `expires_at`, `used_at`; partial uniques on live `code` and live `(user, venue)`. |
| `idempotency_keys` (010) | Grant replay guard. | `key` PK, `scope`, `created_at`; no automatic cleanup. |
| `venue_staff` (009, 011) | Counter seats. | `venue_id`, `identity_id` (nullable until claimed), `display_name`, `role`, `claim_token` + expiry (partial unique), `active`; unique `(venue_id, identity_id)`. |
| `partners` (008, 011) | Referral partners. | `code` unique, `identity_id`, `claim_token` + expiry, `commission_pct`, `exclusive_city`, `exclusive_until`, `active`. |
| `partner_payouts` (014) | Monthly statements. | unique `(partner_id, period)`, `amount`, `venues`, `paid_at`. |
| `passport_awards` (016) | One row per person per tier. | unique `(user_identity_id, tier)`, `venue_count`, `bits_awarded`, `trophy_asset_id`, `mint_tx`, `trophy_attempted_at` (default now()). |
| `bits_transactions` (001, 002) | Append-only BITS ledger, keyed by wallet. | `wallet_address`, `amount` (signed), `reason`, `metadata`; index `(wallet_address, created_at desc)`. Balance = SUM(amount) (`supabase-admin.ts` lines 239–258). Reasons in code: claim, stamp, stamp_revoked, loyalty_trophy, loyalty_trophy_retro, passport_trophy, referral_inviter, referral_friend, reward_claim, reward_expired. |
| `bits_balance` (001, 002) | Materialised balance, maintained by `creditBits` but not read for balances. | partial unique on `wallet_address`. |
| `reward_items` (020) | BITS catalog. | `slug` unique, `price_bits`, `stock` (null = unlimited), `venue_ids uuid[]`, `active`. |
| `reward_claims` (020) | BITS spend → 6-char pickup code, 14-day TTL, lazy expiry + refund. | partial uniques: one pending per `(user, reward)`, live `code`; `status` pending/fulfilled/expired/cancelled; `venue_id`, `fulfilled_by`. |
| `pin_orders` (021) | Physical lots shipped to venues; stock is derived (sent − fulfilled). | `kind` starter/purchase, `status` planned/sent/paid, `unit_price`. |
| `venue_billing` (019) | Invoice details per venue. | unique `venue_id`; `company_name`, `cui`, `billing_day` 1..28, `recurring`, `vat_rate`, `trial_ends_at`. |
| `venue_invoices` (019) | One row per venue per period, written before Oblio is called. | unique `(venue_id, period)`; `oblio_series/number/link`, `due_at`, `paid_at`, `payment_method`. |
| `admin_audit_log` (007) | Every admin support lookup, export, erase, marketing export. | `admin_privy_id`, `action`, `subject_code`, `detail` (privy id stored as sha256). |
| `erasure_log` (007) | Proof of GDPR erasure without PII. | `privy_id_hash`, `erased_by`, `rows_deleted`. |
| `collectibles_catalog`, `claims`, `characters`, `solana_config`, `solana_wallets` (001, 002) | Figurine claim flow and tree address. | `claims` unique on `code`; `solana_config(key, value)`. `solana_wallets` has no code path. |

Consent and privacy in code: marketing consent is opt-in, the email is taken
from Privy, never from the request body (`loyalty.ts` lines 1034–1046);
birthday is day+month only with a pair check constraint (migration 017); GDPR
export/erase live in `admin.ts` lines 806–929.

---

## F. Billing

Files: `apps/api/src/routes/billing.ts`, `apps/api/src/lib/billing-db.ts`,
`apps/api/src/lib/oblio.ts`, `.github/workflows/billing.yml`, migrations 019,
022, 023.

- Oblio client: `POST /authorize/token` (form-encoded, token cached ~1 h) then
  `POST /docs/invoice` (JSON). One retry on 401. Payload includes `einvoice: 1`
  for Romanian clients (e-Factura submission through Oblio), `vatIncluded`
  from `OBLIO_PRICE_INCLUDES_VAT` (default included), `vatName` from
  `OBLIO_VAT_NAME` (default `Normala`), `sendEmail: 0` always.
- Dry-run gate: `oblioStatus().dryRun` is true unless `OBLIO_DRY_RUN` is
  exactly `"0"`; a missing `OBLIO_EMAIL`/`OBLIO_SECRET`/`OBLIO_CIF`/
  `OBLIO_SERIES` also forces dry run. In dry run the full payload is returned
  and nothing leaves the server. `index.ts` logs whether billing is live at
  startup.
- Reserve-then-issue: `reserveInvoice` inserts into `venue_invoices` first;
  `23505` on `(venue_id, period)` means already invoiced. On Oblio failure or
  dry run, `releaseInvoice` deletes the reservation. On success
  `completeInvoice` writes series/number/link.
- Who is due (`venuesDueForInvoice`): `venue_billing.recurring = true`,
  `venues.billing_status = 'active'`, `monthly_fee > 0`, today (Bucharest) ≥
  `billing_day`, `trial_ends_at` in the past or null.
- Annual (`billing_period = 'annual'`, migration 023): invoiced only in the
  anniversary month of `paid_since` (current month if unset), amount
  `monthly_fee × ANNUAL_MONTHS_PAID (10)`, period label "12 luni, 10 plătite".
  The `(venue_id, period)` gate yields one invoice per year. The manual
  `POST /api/admin/billing/issue` respects the same rule.
- Cron: `billing.yml` runs daily at 07:00 UTC and `POST`s
  `https://heropadapi-production.up.railway.app/api/billing/cron` with header
  `x-cron-secret`. The API compares it to `BILLING_CRON_SECRET` in constant
  time and fails closed when unset. Rate limit 10/min. Non-zero `failed` count
  returns HTTP 500 so the Actions run goes red.
- Admin screens: `GET /api/admin/billing/overview`, `POST .../venue/:slug`,
  `POST .../issue`, `POST .../run`, `POST .../invoice/:id/paid`
  (`apps/web/src/components/AdminBilling.tsx`).
- Plan names are inferred from the fee for the invoice line
  (`planFromFee`, `billing.ts` lines 73–78) even though `venues.plan` exists
  since migration 022. Public prices live in `apps/web/src/lib/plans.ts`.
- Partner commission is computed in integer bani from `monthly_fee ×
  commission_pct` only for `billing_status = 'active'` venues; payouts are
  recorded per month by the admin (`partners-db.ts`).

---

## G. Deployment topology

- Frontend: Vercel builds `apps/web` (`vercel.json` `buildCommand`), serves
  `apps/web/dist`, rewrites all non-`/api/` paths to `index.html`. Headers:
  `nosniff`, `X-Frame-Options: DENY`, HSTS, `Permissions-Policy`
  (camera=self), CSP limited to `object-src 'none'; base-uri 'self';
  frame-ancestors 'none'` (no `script-src`).
- API: Railway, Nixpacks, `npm install --include=dev && npm run build`, start
  `node dist/index.js`, health `/healthz` (`apps/api/railway.json`). Port from
  `PORT` (default 8787). The workflows hard-code the production API host
  `heropadapi-production.up.railway.app`.
- Env separation: in dev the API loads the repo-root `.env` (`index.ts` line
  10; `vite.config.ts` `envDir` points at the root too). In production, env
  vars come from the Railway/Vercel dashboards; `VITE_*` values are the only
  ones that reach the browser. Server-only names in use: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SOLANA_RPC_URL`, `SOLANA_ADMIN_PRIVATE_KEY`,
  `BUBBLEGUM_TREE_ADDRESS`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `HMAC_SECRET`,
  `ADMIN_PRIVY_IDS`, `CORS_ALLOWED_ORIGINS`, `BILLING_CRON_SECRET`, `OBLIO_*`,
  `LOYALTY_DAILY_CAP`, `TROPHY_DAILY_CAP`, `TROPHY_GLOBAL_DAILY_CAP`,
  `TROPHY_BITS_REWARD`, `STAMP_BITS_REWARD`, `PASSPORT_BITS_*`,
  `PASSPORT_METADATA_URI_*`, `TROPHY_METADATA_URI`, `REFERRAL_BITS_*`,
  `REFERRAL_DAILY_CAP`. Browser: `VITE_API_BASE_URL`, `VITE_PRIVY_APP_ID`,
  `VITE_SOLANA_CLUSTER`. `.env.example` is out of date: it lists unused
  `JWT_SECRET`, `VITE_SUPABASE_ANON_KEY`, `API_BASE_URL` and omits most of the
  names above.
- Push to `main`: no GitHub workflow builds, tests, or deploys. Whether Vercel
  and Railway auto-deploy from `main` is configured in their dashboards and is
  unclear from the code. `db-restore-test.yml` additionally runs on pushes
  that touch itself.
- Scheduled jobs: billing daily 07:00 UTC; `db-backup` daily 02:23 UTC
  (`pg_dump` via `postgres:17` container to a 30-day GitHub artifact, requires
  `SUPABASE_DB_URL` secret, pooler host); `db-restore-test` monthly on the 1st
  (restores the latest artifact into a throwaway Postgres and asserts ≥15
  tables and non-empty `venues`/`user_identity`/`stamps`); `keepalive` every
  6 h hitting `/api/loyalty/venues` because the Supabase free tier pauses
  after inactivity (comment in `keepalive.yml`).
- Service worker (`apps/web/public/sw.js`, registered in production only by
  `main.tsx`): precaches `/`; cache-first for images; network-first for
  everything else with same-origin GET responses cached as fallback. API calls
  are cross-origin and are never cached.
- CORS (`index.ts` lines 44–73): default allowlist `http://localhost:5173`,
  `https://heropad.vercel.app`, `https://www.heropad.vercel.app`,
  `https://heropad.supervictoruniverse.com`; override with
  `CORS_ALLOWED_ORIGINS`. Requests without an `Origin` header are allowed.
  `credentials: true`. Blocked origins are denied without throwing.
- Rate limits (`express-rate-limit`, default in-memory store, per instance):
  loyalty 120/min, admin 60/min, user 60/min, rewards 60/min, partner 60/min,
  claim 30/min, billing cron 10/min, plus `claimAttemptLimiter` 10/hour on the
  three activation-code endpoints.
- Caches in process memory: `/api/user/me` 10 s TTL (`user.ts`), counter
  check-ins (section B), Oblio token.

---

## H. Security and trust boundaries as implemented

What holds:

- Every write to loyalty data goes through the API with the service-role key;
  the browser holds no database credential.
- Identity is a verified Privy token on every `/me`, `/merchant`, `/admin`,
  `/partner`, `/rewards/me` route. Wallet addresses supplied by the client are
  verified against Privy before use (`user.ts`, `loyalty.ts` wallet hint).
- Stamps are granted only by an owner or an active staff seat; the customer
  page has no grant endpoint. Self-grant and self-redeem are blocked.
- Redemption requires a 5-minute code generated on the customer's phone and
  consumed with a conditional update. Card-level uniqueness (migration 012)
  closes the double-code hole.
- Mints are reserved before spending (`trophy_attempted_at`, passport unique
  row) and capped per venue (50/day) and globally (300/day).
- Activation codes for owners, staff and partners: 8 chars from a 31-symbol
  alphabet, expiring, partial-unique, consumed atomically, attempts limited
  per account.
- Admin access is an explicit DID allowlist that fails closed; support
  lookups, exports, erasures and marketing exports are audit-logged with a
  hashed subject.
- Secrets are never logged; startup prints presence only (`index.ts` lines
  134–149).
- Merchant-controlled URLs are validated (https-only, Google hosts for the
  review link) and re-checked in the client before rendering (`Loyalty.tsx`
  `safeHttpsUrl`).

Known gaps (honest list):

1. `POST /api/claim` is unauthenticated and mints to whatever
   `walletAddress` the body carries. The comment (claim.ts lines 29–32)
   accepts this as "donating" a cNFT; it also means a leaked code+signature
   pair is enough to mint, and there is no per-account limit.
2. The `?tap=1` check-in is not proof of presence. Any logged-in user can
   `POST /me/:slug/checkin` and have their code auto-loaded on the counter
   (`Business.tsx` lines 188–198). The barista still has to press grant, but
   the auto-load reduces the human check to "did I just serve this person".
   The comment at `loyalty.ts` 1055–1062 acknowledges it.
3. In-memory state (check-ins, all rate-limit stores, the `/api/user/me`
   cache) assumes a single API instance and is lost on restart or redeploy.
4. Admin keypair custody: one hot key in a Railway env var owns the tree,
   pays every mint, and is the sole verified creator. No rotation, HSM, or
   spend limit beyond the daily trophy caps. `scripts/gen-admin-keypair.js`
   prints the secret to stdout.
5. Asset-id fallback (`metaplex.ts` lines 106–124) derives the leaf from the
   tree's current `sequenceNumber`; two concurrent mints can cross-assign
   asset ids. The primary parser is used first, so this only bites when
   parsing fails.
6. `retro-mint-trophies.ts` bypasses `reserveTrophyMint` and both caps, so a
   row whose mint succeeded but whose `setRewardTrophy` write failed can be
   minted twice by the script.
7. Redeem: `markRedeemCodeUsed` and `redeemReward` are two statements; a
   crash between them consumes the code without writing the reward. No
   transaction wraps them (Supabase JS, no RPC).
8. Daily stamp cap and "today" for revoke use the UTC `stamp_day`, not the
   venue's `timezone`; happy hour and birthday do use the venue zone.
9. Trophies are not in a verified Metaplex collection (`collection.key` is
   the system program, `verified: false`). Ownership listing filters by tree
   address instead (`helius.ts`). Wallets and explorers will show them as
   uncollected.
10. Off-chain metadata is mutable JSON on Vercel (`heropad.vercel.app`) rather
    than immutable storage; `seed-codes.ts` line 60 notes Arweave/Pinata as a
    later step. Three of the five JSON files point at `.png` images that are
    not tracked (only `.webp`); `placeholder.json` does not exist.
11. Billing: `OBLIO_DRY_RUN` defaults safe, but going live is a single env
    flip and `einvoice: 1` submits to ANAF for every Romanian client. No
    second confirmation exists in code.
12. CSP has no `script-src`; XSS protection relies on React escaping.
    Venue logos are merchant/admin-supplied data URLs rendered in `<img>`.
13. `idempotency_keys` grows without bound (cleanup is a comment in
    migration 010).
14. `.env.example` misleads (see G). `jsonwebtoken` and web `supabase-js` are
    dead dependencies.
15. No automated tests; no CI on push. The only CI is the monthly restore
    test.
16. GDPR erase: Privy account deletion is a manual reminder in the response;
    on-chain assets are permanent (stated in the export note).
17. `manager` role is stored but has no distinct authorization.
18. Staff can revoke any customer's stamps from today; mitigated by
    `revoked_by` attribution, not prevented.

---

## I. Cost of a cNFT mint

Only what the code and comments state:

- Tree: `create-tree.ts` comment — depth 14, buffer 64, "up to 2^14 = 16,384
  cNFTs", "~0.06 SOL one-time storage rent on devnet (free with airdrop)".
- Per mint: `solana-admin.ts` comment — the admin "pays mint fees on devnet
  (~free with airdropped SOL)". No lamport figure per mint appears in code.
- README — "$0.0001 unit cost" per cNFT. This is a README claim, not derived
  in code.
- Budget guard: at most 300 reservations per rolling 24 h across all venues
  and passports (`TROPHY_GLOBAL_DAILY_CAP`), 50 per venue.

ASSUMPTION — verify (2026-09-21): a `mintV1` is one transaction with one
signer, so the base network fee is 5,000 lamports (0.000005 SOL) plus any
priority fee; at the 300/day cap that is ≈1.5 M lamports ≈ 0.0015 SOL/day,
excluding tree rent and priority fees. SOL price and canopy-related rent are
not in the code.

---

## J. Planned / not yet implemented

Referenced in comments, i18n, plans, the admin guide or the README, but absent
from code:

- `POST /api/mint` — stub returning 501 (`apps/api/src/routes/mint.ts`).
- Mainnet launch and a mainnet tree (README roadmap; `AdminGuide.tsx` line
  538 "mainnet (trofee reale, plan scris)").
- NFC "Faza 2b": chip cryptography, tap-earned presence BITS, redeem via the
  figurine (`AdminGuide.tsx` line 538). `stamps.source = 'ntag_tap'` and
  `venues.nfc_secret` are reserved for it.
- Web NFC in-page reading (`nfcService.ts`) — written, not wired.
- Capacitor native wrapper (`platformService.ts`, `storageService.ts`,
  `nfcService.ts` comments).
- Automated email (win-back, "we miss you") with a provider such as Resend
  (`AdminGuide.tsx` lines 538, 549). Today the newsletter is a consented CSV
  export for Substack (`admin.ts` lines 931–1041).
- Chain plan features: multi-location cards and a consolidated report
  (`plans.ts` lines 105–112). No venue group concept exists in the schema.
- Plan-based feature gating: the API applies no `venues.plan` checks; every
  venue can use happy hour, birthday, announcements, order links.
- Streaks, surprise rewards, challenges, churn prediction, POS integration,
  Apple/Google Wallet passes, white-label (`AdminGuide.tsx` lines 540–555).
- Hall of Heroes identity linking and V-DASH skins from claims
  (`user_identity.gmail/mvx_wallet/phantom_wallet`, README, `Play.tsx`).
- Permanent metadata storage (Arweave/Pinata, `seed-codes.ts` line 60).
- Venue-specific trophy artwork (`docs/AI_ASSET_REGISTER.md` "planned" row)
  and an `ai_assisted` metadata attribute (same file).
- Marketplace/royalty enforcement (README roadmap). Nothing in code.
- Merchant-configurable daily stamp cap (`loyalty.ts` line 110 comment).
- `packages/db/README.md` TODOs: character seed, `vdash_runs`, `b2b_partners`.
- `privy.ts` line 43: login-modal logo.

---

## K. Questions for Valentin

1. Which cluster does the production Railway `SOLANA_RPC_URL` point at today?
   `/healthz` will say; the README says devnet.
2. Is the tree address in the README the live one? Has a separate tree been
   created for mainnet, and where is its address stored (`solana_config` vs
   `BUBBLEGUM_TREE_ADDRESS`)?
3. Are Vercel and Railway configured to auto-deploy from `main`? Does
   `feature/solana-frontier` deploy anywhere (preview)?
4. Have all 23 migrations been applied to the production database, in order?
   The README still lists only 001–002.
5. Is `OBLIO_DRY_RUN=0` set in production? Has any real invoice been issued
   through this code, and was e-Factura submission confirmed with the
   accountant?
6. Is the figurine HMAC claim flow (`/api/claim`) live for real customers, or
   only demo codes? The landing marks it "Coming soon".
7. How exactly are the NTAG424 tags programmed — a plain NDEF URL
   `https://<host>/loyalty/<slug>?tap=1`? Any tag-side security features
   enabled?
8. Where are the `.png` images referenced by `passport-*.json` and
   `super-victor.json` served from? Only `.webp` files are tracked.
9. Is `cnft/placeholder.json` supposed to exist, or should `claim.ts` default
   to `super-victor.json`?
10. Privy embedded wallets: which key-management mode is enabled in the
    dashboard (the README says MPC)? Has wallet export been tested end to end?
11. Admin keypair: besides the Railway variable, where is the secret backed
    up, and who can read the Railway project? Any rotation plan?
12. Is the API a single Railway instance? (In-memory check-ins and rate limits
    assume so.)
13. Is the `manager` staff role meant to differ from `staff`?
14. Supabase: free tier (keep-alive implies it) and which region (README says
    EU)? Is PITR planned?
15. Which domain is canonical — `heropad.vercel.app` or
    `heropad.supervictoruniverse.com`? Metadata URIs and the README use the
    former; `index.html` canonical uses the latter.
16. Has `retro-mint-trophies.ts` ever been run against production?
17. Are the daily caps left at defaults (15 stamps, 50/300 trophies) or
    overridden by env?
18. Is Vercel Analytics switched on in the dashboard?
19. Should the stamp daily cap and revoke window use the venue time zone
    rather than UTC?
20. `oblio.ts` references `hoh-backend`; is that the same Oblio account and
    series, and does anything else issue invoices from it?
21. Is there a staging Supabase/Railway environment, or is dev run against
    production data?
22. Do you want `jsonwebtoken`, web `supabase-js`, `nfcService.ts` and the
    unused `user_identity`/`venues` columns removed before judging?
