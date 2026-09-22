# Daily proof anchoring — design (not built)

Status: **design for approval**. Nothing in this document exists in the
code. The migration and the job are described so that the build is a
transcription, not a second design.

## 1. What this is for, and what it is not

A café that uses HeroPad accumulates a record of its footfall: stamps
handed out, distinct customers, rewards claimed. A bank, a landlord, a
franchise or a sponsor may ask the café to prove that number. Today the
proof is "HeroPad says so", which is worth exactly as much as HeroPad's
word, and HeroPad could edit the rows.

Anchoring makes the record **tamper-evident after the fact**: every day,
per venue, HeroPad publishes a fingerprint of that day's events to a
public ledger that HeroPad cannot edit. Anyone can later check that a
given event, or a given day's totals, matches the fingerprint published at
the time.

It does **not** make the data true at the time of writing (see §9). It
makes silent edits after publication impossible without detection.

## 2. What is hashed

Per venue, per venue-local day, the **events** are:

| Event | Source rows | Fields in the leaf |
|---|---|---|
| `stamp` | `stamps` inserted that day | `id`, `created_at`, `count = 1`, `source`, `granted_by_slot` |
| `revoke` | `stamps.revoked_at` set that day (the original stamp's leaf is not touched) | `stamp_id`, `revoked_at` |
| `reward` | `rewards_redeemed` that day (full cards) | `id`, `redeemed_at`, `stamps_consumed`, `reward_type` |
| `milestone` | `milestone_claims` that day | `id`, `claimed_at`, `milestone_at` |

Each event also carries `customer_slot`: not the customer's identity, but
`HMAC-SHA256(day_key, user_identity_id)` where `day_key = HMAC-SHA256(ANCHOR_SECRET, venue_id ∥ day)`.
The same person is the same slot within one venue-day (so "unique
customers" is checkable from the leaves) and unlinkable across days and
venues without the secret. `granted_by_slot` is the same construction for
the staff member. **No personal data goes into a leaf**, and a leaf is
what a verifier sees when given a proof; the root is the only thing that
goes on chain.

Leaf preimage: the canonical JSON of the event (§3), UTF-8, hashed with
SHA-256 prefixed by `0x00` (RFC 6962 leaf hashing, so a leaf can never be
confused with an internal node).

The **day summary** is computed from the same leaves and stored beside the
root: `stamps`, `revokes`, `net_stamps`, `unique_customers` (distinct
`customer_slot` among stamps), `rewards`, `milestones`, `event_count`.

## 3. Deterministic ordering and canonical form

- Events are ordered by `(occurred_at, kind, id)` ascending, where
  `occurred_at` is the row's own timestamp in UTC ISO-8601 with
  milliseconds, `kind` in the fixed order stamp < revoke < reward <
  milestone, `id` as lower-case UUID text. Two runs over the same rows
  produce the same order.
- Canonical JSON: keys sorted, no whitespace, strings escaped per RFC 8785
  (JSON Canonicalization Scheme), integers only (no floats anywhere).
- Tree: binary Merkle tree over the ordered leaves, internal node =
  `SHA-256(0x01 ∥ left ∥ right)`; when a level has an odd count, the last
  node is promoted unchanged (not duplicated), as in RFC 6962. An empty day
  has root `SHA-256(0x00)` and is still anchored, so absence is a
  statement, not a gap.
- The day is the **venue's local day** (`venues.timezone`, default
  Europe/Bucharest), the same clock the counter already uses for the daily
  cap. Boundaries are computed once per run with `localDayBounds`.

## 4. Storage: `venue_anchors` (migration 026, additive)

```
venue_anchors
  id              uuid pk
  venue_id        uuid → venues
  day             date            -- venue-local day
  version         int  not null default 1
  root            bytea (32)
  event_count     int
  summary         jsonb           -- §2 counts
  leaves_hash     bytea (32)      -- SHA-256 of the canonical leaf list, for audit
  chain_sig       text            -- transaction signature once anchored
  chain_slot      bigint
  anchored_at     timestamptz
  status          text  check in ('computed','anchored','failed')
  reason          text            -- for version > 1: why a new version exists
  created_at      timestamptz default now()
  unique (venue_id, day, version)
```

Leaves themselves are **not** stored: they are recomputed from the source
rows on demand (§7), and `leaves_hash` lets an auditor confirm a recompute
reproduces the list that was anchored.

## 5. The job

- Trigger: the existing GitHub Action pattern (`billing.yml`), a daily
  `POST /api/anchor/cron` guarded by `ANCHOR_CRON_SECRET`, fails closed
  like billing. Runs at 04:00 UTC; for every venue it anchors every
  venue-local day that is **fully in the past** and has no `anchored`
  row, going back up to 30 days.
- Idempotent: a run that finds a `computed`/`failed` row for a day
  re-attempts the chain write for that row; a run that finds `anchored`
  does nothing. Two overlapping runs cannot both insert version 1 for the
  same day (unique index).
- Per day: compute leaves → root → summary; insert the row as `computed`;
  send the transaction; on confirmation update to `anchored` with the
  signature. On failure mark `failed` with the error; the next run retries.
  A missed day is therefore not lost, only late, and the row's
  `anchored_at` shows how late.
- Budget: at most 200 anchors per run, oldest first; more venues than that
  means batching (§6) before it means dropping.

## 6. On-chain mechanism and cost

**Chosen: one Memo-program instruction per venue-day**, sent from a
dedicated anchoring keypair (`SOLANA_ANCHOR_PRIVATE_KEY`, separate from
the mint key so a compromised mint key cannot forge anchors and a
compromised anchor key cannot mint).

Memo text (UTF-8, ≤ 120 bytes):

```
hpanchor/1 <venue_id> <day> <version> <root hex>
```

The venue is identified by its HeroPad UUID; the public mapping UUID →
venue name lives in the venue's report and in HeroPad's well-known
document (`standard/SPEC.md` §4 lists the anchoring key there too).

**Cost, mainnet, per venue per year**

| Item | Lamports | SOL |
|---|---|---|
| Base fee per transaction (1 signature) | 5 000 | 0.000005 |
| Priority fee (optional, to land in busy hours) | ~1 000 | 0.000001 |
| Rent | none: a memo stores nothing in an account | 0 |
| **365 days** | ~2.2 M | **≈ 0.0022 SOL** |

At 100 venues: ≈ 0.22 SOL a year. At 1 000 venues the job switches to
**batching**: several memo instructions in one transaction (about 10 per
transaction inside the 1 232-byte limit), which divides the fee by ten and
changes nothing for verification, since each memo is still its own
instruction with its own venue and day.

**Alternatives considered**

- *One PDA account per venue holding the latest root*: 0.0009 SOL rent per
  venue once, then the same fee per update, plus a program to deploy and
  maintain. Only the latest root is readable without history scanning, so
  it proves less than the memo trail for more work.
- *An account-compression Merkle tree of all anchors*: elegant, but adds a
  program dependency and DAS-style indexing for what is one line of text a
  day. Not justified at this scale.
- *Publishing to a second chain or a public timestamping service*: no
  reason to; the customer's trophies are already on Solana and the reader
  needs one RPC.

**Discovery without HeroPad**: every anchor is signed by the anchoring
key, so `getSignaturesForAddress(anchor key)` lists every anchor ever
sent, in order, from any RPC. A venue that lost HeroPad's report can still
find its days.

## 7. Verification path

**Proof of one event** (produced by `GET /api/anchor/:venue/:day/proof/:eventId`, owner-only):

```json
{
  "standard": "hpanchor/1",
  "venue_id": "…", "day": "2026-09-22", "version": 1,
  "leaf": { …canonical event JSON… },
  "path": [ { "side": "left", "hash": "…" }, … ],
  "root": "…",
  "chain": { "signature": "…", "memo": "hpanchor/1 … …" }
}
```

Verifying, in order: (1) canonicalise `leaf`, hash with the `0x00` prefix;
(2) fold up the path with `0x01`-prefixed hashes to a root; (3) compare
with `root`; (4) fetch the transaction by `signature` from any RPC, find
the memo instruction, compare venue, day, version and root; (5) check the
transaction's signer is the anchoring key published at
`https://heropad.supervictoruniverse.com/.well-known/venue-credentials.json`.
Steps 1–3 need no network; 4–5 need one RPC call and one HTTPS fetch.

**Proof of a day's totals**: the summary is not hashed into the root
directly; a verifier who wants the totals asks for the full leaf list
(`GET …/leaves`, owner-only, no personal data by construction), recomputes
root and counts, and compares. This is what "verifiable report" means.

**Tools**: a public page `/verify` that takes a proof file and shows the
five checks turning green, and a `standard/verify-anchor.mjs`
dependency-free CLI doing the same. Both read-only, no session.

## 8. The café's view

One sentence in the venue dashboard, in the venue's language, no ledger
vocabulary:

> RO: „Cifrele tale de zi sunt sigilate în fiecare noapte. Un raport
> sigilat poate fi verificat de oricine, oricând, fără să ne creadă pe
> cuvânt.”
> EN: "Your daily numbers are sealed every night. A sealed report can be
> checked by anyone, any time, without taking our word for it."

And one button, **„Descarcă raportul sigilat”** / "Download the sealed
report": a PDF (same generator as the offer) with one line per day —
stamps, unique customers, rewards, the seal (root, shortened) and a link
labelled "check" that opens `/verify` for that day — plus a CSV of the
same. Nothing else. The word "seal" is the customer-facing name of the
anchor.

## 9. What an attacker who controls the HeroPad server can still do

Honest list, because the feature is only worth what it admits:

- **Invent events before anchoring.** Anchoring certifies that the record
  existed by the time of the anchor, not that a coffee was bought. A
  fabricated stamp inserted on the day it claims to happen is anchored as
  faithfully as a real one. Defences are elsewhere: one stamp per
  customer per venue per day, the daily cap, staff attribution, and the
  customer's own phone showing the stamp arrive.
- **Withhold anchors.** Stop the job and no fingerprint is published;
  the gap is visible (missing days in the signer's history) but the data
  for those days is unprotected until anchored.
- **Anchor a root over edited data.** Edits made *before* the anchor are
  invisible to anchoring. Edits *after* produce leaves that no longer
  match; that is the one thing this catches.
- **Publish a new version.** A version 2 for an already anchored day is
  legitimate (a late offline sync, a correction) and is itself anchored
  with a reason; a reader sees both. Silent replacement is impossible, but
  an attacker can bury a lie under a plausible reason. The report shows
  every version, so this is loud, not prevented.
- **Rotate the anchoring key.** The key is published in the well-known
  document; an attacker with the server can publish a new key. Old
  anchors stay valid under the old key; readers should keep the date of
  each key. This is the same trust boundary as the credential standard.
- **Read everything.** Anchoring adds no confidentiality; it is designed
  so that what it publishes (a 32-byte root) reveals nothing, and what a
  proof reveals (blinded slots, timestamps) identifies nobody.

Anchoring is worth building for one reason: it turns "trust HeroPad" into
"trust HeroPad at the time, and check it afterwards". That is the promise
a café can carry to a bank; it is not more than that.

## 10. Build plan (after approval)

1. Migration 026 (`venue_anchors`), additive, run by the owner first.
2. `apps/api/src/lib/anchor.ts`: canonicalisation, leaves, tree, proof.
   Pure functions with fixture tests (known leaves → known root).
3. `POST /api/anchor/cron` + GitHub Action `anchor.yml`; devnet first,
   with the anchoring key on Railway only.
4. `GET /api/anchor/:venue/:day/proof/:eventId`, `…/leaves`, `…/report`.
5. `/verify` page and `standard/verify-anchor.mjs`.
6. The dashboard sentence and the sealed report button.
7. Publish the anchoring key in the well-known document.

Estimated cost to run: under 0.01 SOL a year at today's venue count.
