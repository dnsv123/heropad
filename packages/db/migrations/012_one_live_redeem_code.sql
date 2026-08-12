-- =============================================================================
-- HeroPad — Migration 012: one live redeem code per customer per venue
-- =============================================================================
-- Why: the integrity audit found a genuine double-spend. Consuming a redeem
-- code is atomic — but it guards the CODE, not the CARD.
--
-- createRedeemCode deleted any unused code and inserted a new one, which is two
-- statements and therefore not atomic. Two concurrent requests both saw nothing
-- to delete and both inserted. The existing unique index is on the code string
-- alone, so two live codes for the same customer at the same venue were
-- perfectly legal. Redeeming both consumed one full card twice: two free
-- coffees, two mainnet mints paid from our wallet, two BITS credits — from ten
-- stamps. Neither redemption collided, because they were different rows.
--
-- This index makes the card the thing that cannot be duplicated. The insert
-- either wins or raises 23505, and the API turns that collision into "reuse the
-- code that already exists" — which is also better behaviour for a customer who
-- taps the button twice.
--
-- Any duplicates already in flight are expired first; they are five-minute
-- codes, so nothing real is lost.
--
-- Apply via Supabase SQL Editor after 011. Safe to re-run.
-- =============================================================================

-- Retire every live code but the newest for each (customer, venue) pair, so the
-- unique index below can be created.
update public.redeem_codes rc
   set used_at = now()
 where rc.used_at is null
   and exists (
     select 1
       from public.redeem_codes newer
      where newer.user_identity_id = rc.user_identity_id
        and newer.venue_id = rc.venue_id
        and newer.used_at is null
        and newer.created_at > rc.created_at
   );

create unique index if not exists uq_redeem_codes_live_per_card
  on public.redeem_codes(user_identity_id, venue_id)
  where used_at is null;

-- ===== VERIFICARE (trebuie să iasă: 1, 0) =====
select
  (select count(*) from pg_indexes
    where indexname='uq_redeem_codes_live_per_card') as index_din_1,
  (select count(*) from (
     select user_identity_id, venue_id
       from public.redeem_codes
      where used_at is null
      group by 1, 2
     having count(*) > 1
   ) dupes) as duplicate_ramase_din_0;

-- =============================================================================
-- End of 012_one_live_redeem_code.sql
-- =============================================================================
