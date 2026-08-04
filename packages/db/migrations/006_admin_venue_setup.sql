-- =============================================================================
-- HeroPad — Migration 006: admin-managed venue setup
-- =============================================================================
-- Why: creating a café used to mean hand-writing SQL, and the merchant became
-- owner through an open "first to claim wins" endpoint (a takeover primitive,
-- closed in the 2026-08 security audit).
--
-- New model: the admin creates the venue in the Admin panel, which generates a
-- one-time SETUP CODE. The café owner opens /business?venue=<slug>, logs in
-- with their own Google account and types that code — becoming the merchant.
-- No SQL, no env flags, no free-for-all claiming.
--
-- Apply via Supabase SQL Editor after 005. Safe to re-run.
-- =============================================================================

-- One-time setup code (cleared the moment it's used).
alter table public.venues
  add column if not exists claim_token text;

-- City/address are optional display + admin conveniences.
alter table public.venues
  add column if not exists address text;

-- Fast lookup when a merchant submits their code.
create index if not exists idx_venues_claim_token
  on public.venues(claim_token)
  where claim_token is not null;

-- ===== VERIFICARE (trebuie să iasă: 1, 1) =====
select
  (select count(*) from information_schema.columns
    where table_name='venues' and column_name='claim_token') as cod_setup_din_1,
  (select count(*) from information_schema.columns
    where table_name='venues' and column_name='address') as adresa_din_1;

-- =============================================================================
-- End of 006_admin_venue_setup.sql
-- =============================================================================
