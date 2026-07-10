-- =============================================================================
-- HeroPad — Migration 004: merchant-granted stamps model
-- =============================================================================
-- Why: validation design changed from self-served stamps (client taps a sticker,
-- needed a hard 1/day DB guard) to MERCHANT-GRANTED stamps (barista grants 1-3
-- per purchase from the /business view). The fraud surface moves from "client
-- spams taps" to "only an authenticated venue owner can grant", so:
--
--   1. DROP the 1/day unique index — a customer buying 3 coffees now rightfully
--      gets 3 stamps the same day. A soft cap (10/user/venue/day) is enforced
--      in the API instead.
--   2. user_identity.loyalty_code — short personal code (e.g. K7M3PQ) the
--      customer shows at the counter; barista types/scans it to grant stamps.
--   3. stamps.granted_by — audit trail: which identity granted the stamp.
--   4. stamps.source gains 'merchant' now and 'ntag_tap' for the future
--      figurine tap (NTAG 424 DNA) so THAT change needs no migration.
--
-- Apply via Supabase SQL Editor after 003. Safe to re-run.
-- =============================================================================

-- 1. Personal loyalty code (barista-facing identifier, NOT a secret).
alter table public.user_identity
  add column if not exists loyalty_code text;

create unique index if not exists uq_user_identity_loyalty_code
  on public.user_identity(loyalty_code)
  where loyalty_code is not null;

-- 2. Audit: who granted the stamp (null = system/self, e.g. future ntag flow).
alter table public.stamps
  add column if not exists granted_by uuid references public.user_identity(id) on delete set null;

-- 3. Merchant-granted model: multiple stamps per day are legitimate.
drop index if exists public.uq_stamps_one_per_day;

-- 4. Allow the new stamp sources.
alter table public.stamps drop constraint if exists stamps_source_check;
alter table public.stamps
  add constraint stamps_source_check
  check (source in ('nfc', 'qr', 'merchant', 'ntag_tap'));

-- Verify (expect: loyalty_code + granted_by present, old index gone):
-- select column_name from information_schema.columns
--   where table_name in ('user_identity','stamps')
--     and column_name in ('loyalty_code','granted_by');
-- select count(*) from pg_indexes where indexname = 'uq_stamps_one_per_day'; -- 0

-- =============================================================================
-- End of 004_merchant_stamps.sql
-- =============================================================================
