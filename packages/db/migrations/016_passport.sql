-- =============================================================================
-- HeroPad — Migration 016: Pașaportul între cafenele (passport_awards)
-- =============================================================================
-- The cross-venue passport: visit 3 / 5 / 8 DIFFERENT partner venues and a
-- tier trophy (bronze / silver / gold) is minted — a cNFT that cannot be
-- obtained any other way, plus a BITS reward.
--
-- Why a table at all: the award must happen exactly once per person per tier.
-- Visits are already known (stamps), but "this tier was paid out" is a fact
-- with money attached (a mint from our admin wallet + a BITS credit), and a
-- fact with money attached needs a row with a unique constraint, not a
-- recomputation. The UNIQUE (user, tier) below is the whole idempotency story:
-- the insert either wins the right to mint or collides with whoever already
-- did.
--
-- trophy_attempted_at follows the migration-013 lesson: it is written at
-- RESERVATION time (default now() on insert), so the global daily mint budget
-- counts spend already in flight, not just spend already confirmed.
--
-- ⚠️ Apply BEFORE deploying the passport code: the global trophy budget starts
-- counting this table, so an API running the new code against a database
-- without it would fail redeems. Apply via Supabase SQL Editor after 015.
-- Safe to re-run.
-- =============================================================================

create table if not exists public.passport_awards (
  id uuid primary key default gen_random_uuid(),
  user_identity_id uuid not null references public.user_identity(id) on delete cascade,
  -- The threshold reached: 3, 5 or 8 distinct venues. Stored as the number
  -- rather than a name so future tiers need no schema change.
  tier int not null check (tier >= 2),
  -- How many distinct venues the person had at award time (>= tier).
  venue_count int not null,
  -- BITS credited with this trophy; 0 until the mint succeeds.
  bits_awarded bigint not null default 0,
  -- The minted cNFT. Null while the mint is pending/retrying.
  trophy_asset_id text,
  mint_tx text,
  -- Reservation timestamp — set on insert, refreshed on a retry. The global
  -- daily mint budget counts these.
  trophy_attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- One award per person per tier, ever. This is the anti-double-mint gate.
  unique (user_identity_id, tier)
);

-- Same posture as every loyalty table: service-role only, no client policies.
alter table public.passport_awards enable row level security;

-- The daily budget query filters on this.
create index if not exists idx_passport_attempted
  on public.passport_awards(trophy_attempted_at);

-- ===== VERIFICARE (trebuie să iasă: 1, true) =====
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'passport_awards') as tabela_din_1,
  (select relrowsecurity from pg_class
    where oid = 'public.passport_awards'::regclass) as rls_activ;

-- =============================================================================
-- End of 016_passport.sql
-- =============================================================================
