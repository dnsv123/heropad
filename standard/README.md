# Sigil

A small, vendor-neutral standard for collectibles issued by physical
places: a completed stamp card, a tier a regular reached, a numbered pin
sold at a festival, a night attended. Written so that **any app can read a
person's collection** and **only the issuing venue can issue for itself**.

## Why

Loyalty programmes lock the customer's history inside one café's app, or
inside one platform's database. When the café closes or the platform
changes hands, the history goes with it. A credential that lives in the
customer's own wallet, in a format anyone can read, is not owned by the
café that issued it nor by the platform that minted it. Several platforms
can then compete on service while the customer keeps one collection.

## What is here

| File | What |
|---|---|
| `SPEC.md` | The standard: fields, allowed values, how a collection is derived, how issuance authority is established on Solana. |
| `schema/venue-credential.schema.json` | JSON Schema for a credential's metadata. |
| `schema/collector-profile.schema.json` | JSON Schema for a derived collection. |
| `examples/*.json` | Three conforming credentials and one that is refused (personal data, wrong date shape, upper-case issuer id). |
| `validate.mjs` | A dependency-free validator: `node validate.mjs my-metadata.json`, or `node validate.mjs --examples`. Prints each problem with its JSON path. |
| `IMPLEMENTATIONS.md` | Who emits this today, how far they are from conformance, and the migration plan. |

There is deliberately **no SDK** yet. Reading a collection is: list the
wallet's assets with any DAS endpoint, fetch each JSON, keep those with a
`credential` object that validates, check the issuer's well-known document.
`SPEC.md` §3–4 is the whole algorithm; a library would be twenty lines
around it and a dependency for everyone. One will exist when a second
reader needs it.

## Issue a conforming credential without HeroPad

1. Own a domain. Publish `https://<your-domain>/.well-known/venue-credentials.json`
   listing the public key(s) you mint with (see `SPEC.md` §4).
2. For each credential, host a JSON file per `SPEC.md` §2 (run it through
   `validate.mjs`). No personal data; the issue date is a day.
3. Mint a Metaplex NFT or a Bubblegum compressed NFT with that JSON as
   `uri`, signing as a creator so the asset carries you as **verified
   creator**. Any Metaplex tooling does this; nothing here is specific to a
   platform.
4. Give it to the customer's wallet. Done: any reader of this standard now
   sees it in their collection, attributed to you.

## Status

Draft 0.1, September 2026. One production implementation (HeroPad, Sibiu,
Romania), which does **not yet** emit conforming metadata — see
`IMPLEMENTATIONS.md` for exactly what it emits and the migration path.
Field names may still move before 1.0. Feedback: open an issue on the
HeroPad repository for now; this directory will become its own repository,
`sigil`, under a neutral organisation.

## Language

Credentials under this standard are mementos. The standard defines no
price, no yield, no exchange and no promise of value, and a conforming
credential must not claim any.

## Licence

MIT. See `LICENSE`.
