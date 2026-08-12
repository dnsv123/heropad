-- =============================================================================
-- HeroPad — Migration 013: revocations leave a trace, mints are reserved
-- =============================================================================
-- Two findings from the integrity audit, both about things that vanish.
--
-- 1. REVOKING A STAMP DELETED THE ROW. When only the owner could revoke, that
--    was self-harm. Staff seats changed the threat: a disgruntled barista can
--    call revoke against any code they saw at the counter, and the deleted
--    rows disappear from the owner's history too — the shift simply looks
--    quieter. That defeats the entire reason staff seats exist. Stamps are now
--    marked revoked instead of deleted, so the act itself is visible, with the
--    name of whoever did it.
--
-- 2. THE TROPHY CEILING COUNTED COMPLETED MINTS. A mint is a confirmed Solana
--    transaction — seconds, not microseconds — and the column that proves it
--    is written afterwards. Every redemption arriving inside that window read
--    the same stale count and minted. The ceiling only ever held against
--    strictly sequential traffic. Counting ATTEMPTS, written before the spend,
--    is what makes it a budget rather than a hope.
--
-- Apply via Supabase SQL Editor after 012. Safe to re-run.
-- =============================================================================

-- --- 1. Soft-delete for stamps ----------------------------------------------

alter table public.stamps
  add column if not exists revoked_at timestamptz;

alter table public.stamps
  add column if not exists revoked_by uuid references public.user_identity(id) on delete set null;

-- Every balance query filters on this, so it carries the read weight.
create index if not exists idx_stamps_venue_live
  on public.stamps(venue_id, created_at desc)
  where revoked_at is null;

-- --- 2. Mint reservation ----------------------------------------------------

-- Written BEFORE the mint is attempted. The ceiling counts these, so spend in
-- flight is already accounted for.
alter table public.rewards_redeemed
  add column if not exists trophy_attempted_at timestamptz;

create index if not exists idx_rewards_attempted
  on public.rewards_redeemed(venue_id, trophy_attempted_at)
  where trophy_attempted_at is not null;

-- Rows minted before this migration already have an asset id; treat their
-- redemption time as the attempt so historical counts stay honest.
update public.rewards_redeemed
   set trophy_attempted_at = redeemed_at
 where trophy_asset_id is not null
   and trophy_attempted_at is null;

-- ===== VERIFICARE (trebuie să iasă: 1, 1, 1) =====
select
  (select count(*) from information_schema.columns
    where table_name='stamps' and column_name='revoked_at') as anulare_din_1,
  (select count(*) from information_schema.columns
    where table_name='stamps' and column_name='revoked_by') as anulat_de_din_1,
  (select count(*) from information_schema.columns
    where table_name='rewards_redeemed' and column_name='trophy_attempted_at') as rezervare_din_1;

-- =============================================================================
-- End of 013_revoke_audit_mint_reserve.sql
-- =============================================================================
