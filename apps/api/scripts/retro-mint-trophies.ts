// Retro-mint missing loyalty trophies.
// ----------------------------------------------------------------------------
// Finds rewards_redeemed rows with no trophy (trophy_asset_id IS NULL), and
// for every customer that NOW has a Solana wallet linked, mints the trophy
// cNFT they should have received, updates the row, and credits the BITS.
// Rows whose customer still has no wallet are skipped (re-run later).
//
// Run locally (uses root .env):  npx tsx apps/api/scripts/retro-mint-trophies.ts

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../../.env'), override: true });

const { getSupabaseAdmin, creditBits } = await import('../src/lib/supabase-admin.js');
const { mintCnftToWallet } = await import('../src/lib/metaplex.js');

const TROPHY_BITS = Number(process.env.TROPHY_BITS_REWARD ?? 1000);
const TROPHY_URI =
  process.env.TROPHY_METADATA_URI ?? 'https://heropad.vercel.app/cnft/trophy.json';

const supa = getSupabaseAdmin();

// 1. All rewards, oldest first — needed to compute per-venue edition numbers.
const { data: allRewards, error: rErr } = await supa
  .from('rewards_redeemed')
  .select('id, user_identity_id, venue_id, trophy_asset_id, redeemed_at')
  .order('redeemed_at', { ascending: true });
if (rErr) throw new Error(rErr.message);

const rewards = allRewards ?? [];
const missing = rewards.filter((r) => !r.trophy_asset_id);
console.log(`Rewards total: ${rewards.length} · missing trophies: ${missing.length}`);
if (missing.length === 0) process.exit(0);

// 2. Lookup maps: identity wallets + venue names.
const identityIds = [...new Set(missing.map((r) => r.user_identity_id))];
const venueIds = [...new Set(rewards.map((r) => r.venue_id))];

const [{ data: identities }, { data: venues }] = await Promise.all([
  supa.from('user_identity').select('id, solana_wallet, loyalty_code').in('id', identityIds),
  supa.from('venues').select('id, name, slug').in('id', venueIds),
]);
const walletById = new Map((identities ?? []).map((i) => [i.id, i.solana_wallet]));
const venueById = new Map((venues ?? []).map((v) => [v.id, v]));

// 3. Edition = position of this reward among the customer's rewards at that venue.
function editionOf(row: (typeof rewards)[number]): number {
  return (
    rewards.filter(
      (r) =>
        r.user_identity_id === row.user_identity_id &&
        r.venue_id === row.venue_id &&
        r.redeemed_at <= row.redeemed_at
    ).length
  );
}

let minted = 0;
let skipped = 0;
for (const row of missing) {
  const wallet = walletById.get(row.user_identity_id);
  const venue = venueById.get(row.venue_id);
  if (!wallet) {
    console.log(`SKIP reward ${row.id}: customer has no wallet linked yet`);
    skipped++;
    continue;
  }
  const edition = editionOf(row);
  const name = `SV Trophy — ${venue?.name ?? 'Venue'} #${edition}`.slice(0, 32);
  try {
    const res = await mintCnftToWallet({
      recipient: wallet,
      name,
      symbol: 'SVTROPHY',
      uri: TROPHY_URI,
    });
    const { error: updErr } = await supa
      .from('rewards_redeemed')
      .update({ trophy_asset_id: res.assetId, milestone_mint_tx: res.signature })
      .eq('id', row.id);
    if (updErr) throw new Error(updErr.message);
    try {
      await creditBits(wallet, TROPHY_BITS, 'loyalty_trophy_retro', {
        rewardId: row.id,
        assetId: res.assetId,
        venue: venue?.slug,
        edition,
      });
    } catch (bitsErr) {
      console.error(`  BITS credit failed (non-fatal): ${(bitsErr as Error).message}`);
    }
    console.log(`MINTED "${name}" → ${res.assetId} (tx ${res.signature.slice(0, 8)}…)`);
    minted++;
  } catch (err) {
    console.error(`FAIL reward ${row.id}: ${(err as Error).message}`);
  }
}

console.log(`\nDone. Minted: ${minted} · skipped (no wallet): ${skipped}`);
