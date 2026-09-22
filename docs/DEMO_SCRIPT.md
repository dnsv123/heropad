# HeroPad — 90-second technical demo script

Screen recording, one take, no voice-over filler. Two phones on camera (or
two browser windows: customer and barista), plus a desktop browser with three
tabs open beforehand: Supabase table editor on `stamps`, the Solana explorer,
and the HeroPad admin `/admin` Network tab.

Set-up before recording (not on camera):

- Customer phone: logged in at `https://heropad.supervictoruniverse.com`,
  card at the test venue has `stamps_required − 1` stamps so one grant
  completes it.
- Barista phone: logged in as owner or staff, `/business?venue=<slug>` open.
- Supabase: `stamps` filtered by `venue_id`, sorted `created_at desc`.
- Admin Network tab open: note the admin wallet balance shown there.
- Remember: a successful grant writes no API log line (only errors do), so the
  proof of the write is the Supabase row, not Railway logs.
- Explorer links: the app builds them from `VITE_SOLANA_CLUSTER`; on devnet
  they carry `?cluster=devnet`, on mainnet none.

| Time | Shot | Say (one sentence) |
|---|---|---|
| 0:00–0:08 | Customer phone: tap the NFC figurine; the browser opens `/loyalty/<slug>?tap=1` and the card shows "checked in". | "The tag is a plain URL; the phone opens the card and announces itself to the counter, nothing installed." |
| 0:08–0:16 | Barista phone: the customer's 6-character code appears on its own in the counter (polled every 5 s); tap **+1**. | "The counter sees the code without typing; the barista still presses grant, so a copied tag URL buys nobody a stamp." |
| 0:16–0:26 | Desktop, Supabase `stamps`: refresh; the new row at the top with `source = merchant`, `granted_by`, `stamp_day`. | "One row per stamp, nothing on chain yet; stamps are free to write and revocable by marking, not deleting." |
| 0:26–0:32 | Customer phone: the meter ticks +1 on the next poll and the card reads complete. | "The phone polls every four seconds; the card is now full." |
| 0:32–0:42 | Customer phone: tap **redeem**, a 5-minute code and QR appear. Barista phone: type or scan it, confirm. | "Redemption needs a code generated on the customer's own phone, consumed once with a conditional update." |
| 0:42–0:50 | Barista phone: response shows the reward done; customer phone: trophy appears in the card's history with an explorer link. | "The coffee is handed over regardless; the mint is best-effort and reserved before it is paid for." |
| 0:50–1:04 | Desktop, Solana explorer: open the asset link; show name `SV Trophy — <venue> #1`, symbol `SVTROPHY`, compressed, tree address. | "One `mintV1` into an admin-owned Bubblegum tree; the leaf is the trophy, the tree was paid for once." |
| 1:04–1:14 | Customer phone: `/profile`; show the wallet address with **Copy** and **Export key**. | "This wallet was created by Privy at first login; the user never saw a seed phrase and HeroPad never held the key." |
| 1:14–1:26 | Desktop, Admin → Network: cluster, admin balance now slightly lower, tree address. | "A stamp costs zero on chain; a trophy costs one transaction fee, about five thousand lamports (ASSUMPTION, verify), and the whole tree of sixteen thousand cost about 0.06 SOL." |
| 1:26–1:30 | Hold on the Network tab. | "Ten thousand trophies fit in one tree for about a tenth of a SOL; the same on regular NFTs is about a hundred." |

Numbers used on camera: tree depth 14 = 16,384 leaves, ≈ 0.06 SOL rent
(`apps/api/scripts/create-tree.ts`, `apps/api/src/lib/metaplex.ts`); base fee
5,000 lamports per single-signer transaction (ASSUMPTION 2026-09-22, verify
on the explorer's fee field for the recorded transaction); regular NFT ≈ 0.01
SOL+ per mint (ASSUMPTION, verify). Full arithmetic in
`docs/ARCHITECTURE.md` section 7.

If a shot fails on the day:

- Trophy skipped (no wallet, cap, RPC error): the counter response says
  why in `trophySkipped`; show that field and say "the reward stands, the
  mint is retried later", then cut to an earlier trophy on the explorer.
- Check-in code does not auto-load: type the code from the customer's card
  (`MyCode`); the grant path is identical.
- Explorer shows "not found": the cluster suffix is wrong; append or remove
  `?cluster=devnet` to match `/healthz`.
