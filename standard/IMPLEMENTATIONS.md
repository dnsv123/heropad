# Implementations and conformance

## HeroPad (production, Sibiu) — the one implementation today

**What HeroPad emits now** (`apps/api/src/lib/metaplex.ts`,
`apps/api/src/routes/loyalty.ts`):

| Aspect | Today | Spec |
|---|---|---|
| Asset kind | Bubblegum compressed NFT, one tree per cluster | any Token Metadata or Bubblegum asset ✓ |
| On-chain name | `SV Trophy — <venue> #<edition>` (32 chars), `SV Passport — <tier>` | free ✓ |
| Symbol | `SVTROPHY`, `SVPASS` | free ✓ |
| Off-chain JSON | one **static** file per kind: `cnft/trophy.json`, `cnft/passport-<tier>.json` | one JSON per asset, with `credential` ✗ |
| Venue in metadata | only in the on-chain name; the JSON says "a HeroPad partner venue" | `credential.issuer.{id,name}` ✗ |
| Edition | only in the on-chain name | `credential.edition.serial` ✗ |
| Issue date | none in metadata (the mint transaction has a block time) | `credential.issued_at` ✗ |
| Creators | HeroPad admin key, `verified: true`, share 100 | verified creator ✓ |
| Collection | none (`verified: false`, system key) | optional ✓ |
| Issuer authority | nothing published | well-known document per venue ✗ |
| Personal data | none | none ✓ |

So: the **on-chain** side already conforms (verified creator, no personal
data). The **off-chain JSON** does not, because it is shared by every trophy
and names no venue, no edition, no date.

**Smallest migration path, for new mints only** (already-minted assets are
not touched; their JSON stays as it is):

1. Serve per-asset metadata from the API instead of a static file:
   `GET /api/cnft/trophy/<reward id>.json` builds the JSON from the
   `rewards_redeemed` row (venue name, edition = the holder's card number
   at that venue, `issued_at` = the redemption day in the venue's time
   zone) and adds the `credential` object. Same for passports
   (`type: "tier"`, `tier.level` 1/2/3, `issuer.id` = HeroPad's own domain,
   since the passport is HeroPad's credential, not a venue's).
2. Mint with `uri` pointing at that URL. One line in the two mint calls.
3. `issuer.id`: the venue's own domain when it has one (a new optional
   `venues.domain` column, additive), else `<slug>.heropad.supervictoruniverse.com`.
4. Publish `/.well-known/venue-credentials.json` for HeroPad's own domain
   listing the admin creator key, and serve the same document for each
   `<slug>.heropad…` sub-domain (one wildcard route). A venue with its own
   domain gets a one-line instruction: host this file, or CNAME the
   `.well-known` path — that is the moment the venue, not HeroPad, holds
   the authority.
5. Mirror `type`, venue, tier, edition into `attributes` for wallets.

Cost: one API route, one optional column, two `uri` changes, one static
document. No change to trees, keys, wallets or the customer UI. Metadata
served by the API is mutable by the API — that is already true of the
static files today; the anchoring work (planned) is what makes issuance
records tamper-evident, and is independent of this.

Status: **not implemented**; this file records the plan agreed with the
owner. It will be marked done here when the first conforming mint exists.
