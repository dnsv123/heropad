# Sigil — specification 0.1 (draft)

*Sigil: the seal a place puts on what it gives you.*

A **venue credential** is a collectible issued by a physical place to a
person who did something there: completed a stamp card, reached a tier,
attended an event, bought a limited item. This document says how such a
credential is written so that **any application can read a holder's
collection**, and how a reader can tell that **only the issuing venue (or a
platform acting for it) issued it**.

The credential is a memento. This specification defines no price, no
exchange and no yield, and a conforming credential must not claim any.

## 1. Where the data lives

A credential is a Solana digital asset (a Metaplex Token Metadata NFT or a
Bubblegum compressed NFT) whose **off-chain JSON** follows the usual
Metaplex layout (`name`, `symbol`, `description`, `image`, `attributes`)
and carries one extra top-level object, `credential`. Wallets and
marketplaces ignore the extra object; readers of this standard look only
at it. Nothing in this standard requires a new on-chain program or account.

```json
{
  "name": "Bătrânu' Sas — card #12",
  "symbol": "BSAS",
  "description": "Full stamp card at Bătrânu' Sas, Sibiu.",
  "image": "https://cards.batranu-sas.example/12.webp",
  "attributes": [
    { "trait_type": "Type", "value": "Stamp card" },
    { "trait_type": "Venue", "value": "Bătrânu' Sas" }
  ],
  "credential": {
    "standard": "sigil/0.1",
    "type": "stamp_card",
    "issuer": { "id": "batranu-sas.example", "name": "Bătrânu' Sas" },
    "edition": { "serial": 12 },
    "issued_at": "2026-09-22"
  }
}
```

## 2. Venue Credential — fields

Top level of `credential`:

| Field | Required | Type | Meaning |
|---|---|---|---|
| `standard` | yes | string | `"sigil/0.1"`. Readers reject other majors. |
| `type` | yes | enum | What was earned. See §2.1. |
| `issuer` | yes | object | The venue. See §2.2. |
| `issued_at` | yes | string | Calendar day, `YYYY-MM-DD`, in the venue's own time zone. A day, not a timestamp: it dates the memento without timing the person. |
| `tier` | when `type` is `tier` | object | `{ "level": integer ≥ 1, "label": string ≤ 40 }`. `level` orders tiers within one issuer; `label` is what people call it. |
| `edition` | when `type` is `limited_edition` | object | `{ "serial": integer ≥ 1, "of": integer ≥ serial (optional) }`. Stamp cards may also carry `edition.serial` as "the holder's n-th card". |
| `physical` | no | object | A linked physical item: `{ "kind": enum, "ref": string ≤ 64 }`. See §2.3. |
| `platform` | no | object | The service that minted on the issuer's behalf: `{ "name": string, "url": https URL }`. Absent when the venue mints for itself. |
| `note` | no | string ≤ 200 | Free text about the item. Never about the holder. |

Anything else under `credential` is ignored by readers and must not carry
required meaning.

### 2.1 `type`

| Value | Meaning | Extra requirement |
|---|---|---|
| `stamp_card` | A completed stamp/punch card. | none (`edition.serial` recommended) |
| `tier` | A level reached at the venue (bronze/silver/gold, regular/local hero…). | `tier` present |
| `limited_edition` | A numbered item: a season, an event, a launch. | `edition` present |
| `visit` | A single visit or check-in worth keeping. | none |
| `event` | Attendance at a dated event. | none (`note` recommended) |

### 2.2 `issuer`

| Field | Required | Type | Meaning |
|---|---|---|---|
| `id` | yes | string | A domain name the venue controls, lower-case, e.g. `batranu-sas.ro`. This is the venue's identity in the standard and the root of its issuance authority (§4). |
| `name` | yes | string ≤ 80 | Human-readable venue name. |
| `url` | no | https URL | The venue's page. |
| `location` | no | string ≤ 80 | City or neighbourhood. Never an address precise enough to place a person. |

A venue without a domain may use a domain a platform runs for it, in the
form `<slug>.<platform-domain>`; the platform then answers for that
sub-domain in §4 exactly as a venue would.

### 2.3 `physical`

`kind` is one of `figurine`, `pin`, `card`, `tag`, `ticket`, `other`.
`ref` is an opaque identifier of the item (a batch, a design code, a
serial). It must not be, contain or derive from anything that identifies a
person: no names, no emails, no phone numbers, no hashes of those.

### 2.4 What must never appear

No field, attribute, image URL or note may contain personal data of the
holder or of anyone else: names, emails, phone numbers, addresses, account
identifiers, or hashes of any of these. `issued_at` is a day, not a time.

### 2.5 Mirroring into `attributes`

For wallets that only show `attributes`, an issuer should mirror `type`,
issuer name, tier label and edition as traits. The `credential` object is
the source of truth when the two disagree.

## 3. Collector Profile — how a collection is derived

A collector profile is **not a new on-chain object**. It is derived, on
demand, by any application, from what the holder's wallet(s) already own:

1. Enumerate the wallet's assets with the DAS API (`getAssetsByOwner`), or
   any equivalent indexer.
2. Fetch each asset's off-chain JSON. Keep those whose
   `credential.standard` starts with `sigil/0.` and that validate against
   §2.
3. For each kept asset, establish authenticity per §4 and record the
   result; do not drop inauthentic assets silently, mark them.
4. Group by `issuer.id`.

Reasoning: the wallet already is the collection; a separate on-chain
"profile" would duplicate it, need its own authority, and become stale the
moment a credential moves. A holder with several wallets presents them
together; the profile is the union.

The JSON shape a reader returns is given in `schema/collector-profile.schema.json`.
It carries the holder's wallet addresses (public by nature) and nothing
else about the holder.

**Reading is open.** Any application may derive any wallet's profile;
there is no permission to ask for. Applications should say so to their
users, because it is also true of every wallet on the chain.

## 4. Issuance authority — who may issue for a venue

Two facts must hold for a credential to be **authentic**:

1. **The asset carries a verified creator.** In Token Metadata and in
   Bubblegum, the `creators` array marks each creator `verified` only if
   that creator's key signed the mint (Bubblegum: the creator is a signer
   of `mintV1`, or verified afterwards with `verifyCreator`). Nobody can
   set `verified: true` for a key they do not hold. This is the on-chain
   primitive; it proves *which key* minted.
2. **That key is authorised by the issuer.** No on-chain primitive binds a
   key to a café. The binding is published by the venue at a fixed URL
   under its own domain, the same domain as `issuer.id`:

   `https://<issuer.id>/.well-known/venue-credentials.json`

   ```json
   {
     "standard": "sigil/0.1",
     "issuer": { "id": "batranu-sas.example", "name": "Bătrânu' Sas" },
     "creators": [],
     "platforms": [
       { "name": "HeroPad", "url": "https://heropad.supervictoruniverse.com",
         "creators": ["<HeroPad creator public key>"] }
     ],
     "collections": []
   }
   ```

   `creators` lists keys the venue holds itself; `platforms[].creators`
   lists keys of services allowed to mint on its behalf; `collections`
   (optional) lists Metaplex collection mints the venue uses. A credential
   is authentic when **at least one verified creator on the asset appears in
   `creators` or in any `platforms[].creators`**, and `issuer.id` in the
   metadata equals `issuer.id` in the document.

A reader caches the document and re-reads it periodically; a venue revokes
a platform by removing its keys, which stops future authenticity, not past
issuance (readers may keep a dated snapshot of the document to judge older
assets; this is left to the reader).

**Why not a verified collection alone.** A Metaplex collection proves that
the collection authority approved the asset. In Bubblegum that authority
signs every mint, so for a platform-minted asset the authority is the
platform's key, which is exactly the key already recorded as verified
creator. The collection adds grouping, not a new fact about the venue; the
well-known document is the fact that is missing on chain. Collections are
therefore optional in this standard, and when used they are declared in
the same document.

**What this does not prove.** That the person holding the asset earned it:
assets can be transferred. A credential is a record of issuance to a
wallet, and holding it is holding the memento, nothing more.

## 5. Conformance

- **Credential**: the JSON validates against `schema/venue-credential.schema.json`
  and the rules of §2 (the validator in this repository checks both).
- **Authentic credential**: conformant, plus §4.
- **Reader**: derives profiles per §3, marks authenticity per §4, never
  invents fields, rejects unknown majors of `standard`.
- **Issuer**: publishes the well-known document over HTTPS, mints with a
  verified creator listed there, writes no personal data.

## 6. Versioning

`standard` is `sigil/<major>.<minor>`. Minors add optional fields; majors
may change required ones. This is 0.1: fields may still move before 1.0,
and there is one production implementation (see `IMPLEMENTATIONS.md`).
