# AI asset register

Which visual assets in this project were produced with AI assistance, from
what, and with what tool. Kept in the repository rather than in private notes
because it is transparency documentation: it needs to survive staff changes,
tool changes, and the day someone asks.

**Why it exists.** Regulation (EU) 2024/1689 (the AI Act) has applied its
transparency rules since 2 August 2026. The obligation to embed a
machine-readable marking falls on the provider of the generative tool, not on
us; ours is disclosure. For artistic work the disclosure may be made in a way
that does not spoil the presentation of the work — a line in the detail view
and this register, rather than a watermark across the artwork.

**The authorship position, stated plainly.** SuperVictor is an original
character drawn by a human illustrator and owned by SVU Journey SRL (EUIPO
filing 019287298). AI is used to derive further poses and props FROM that
owned artwork. Nothing here originates from a text prompt alone, and no third
party's style or characters are involved.

## How to add a row

One row per asset or per batch that shares a source and a tool. When in doubt,
record it — an unlisted asset is the only thing this register can get wrong.

| Asset | Where | Source | AI involvement | Tool | Date |
|---|---|---|---|---|---|
| SuperVictor base character | `super-victor*.webp/png` | Original illustration, commissioned | **None** — human artwork | — | 2024 |
| Power levels 1–10 | `apps/web/public/loyalty/levels/level-{1..10}.webp` | The base character above | Poses derived from the owned illustration | image-generation tool | 2026-07 |
| Trophy artwork | `apps/web/public/cnft/trophy.json` → image | The base character above | Pose + trophy prop derived | image-generation tool | 2026-07 |
| Venue trophy variants | *(planned)* | The base character above | Prop + venue accent per café | image-generation tool | — |

> Fill in the exact tool names and dates from your own records. A register with
> "some AI tool" in it is worse than useless if it is ever read seriously.

## What we disclose in the product

- A line in the collectible detail view stating the artwork is derived from our
  own illustrated character with AI assistance.
- An `ai_assisted` attribute in the metadata of trophies minted from the point
  we adopt it, so the disclosure travels with the asset rather than living only
  on our site.

## What we do NOT do

- We do not watermark across the artwork. The AI Act explicitly allows a
  disclosure that does not hamper the display of a creative work, and a
  collectible that is defaced is not a collectible.
- We do not retrofit metadata onto already-minted assets. Their metadata is
  public and held by real people; changing what someone already owns is worse
  than the imprecision it would fix. Disclosure applies going forward.
