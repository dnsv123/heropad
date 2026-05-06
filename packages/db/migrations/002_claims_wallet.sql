-- =============================================================================
-- HeroPad — Migration 002: identify users by Solana wallet address
-- =============================================================================
-- Why: HeroPad uses Privy for auth, not Supabase Auth. The original schema in
-- 001 keyed claims / bits to `auth.users(id)`, but we never insert rows there —
-- Privy holds the identity. Instead we treat the Solana wallet address as the
-- canonical user identifier (which is how on-chain ownership works anyway).
--
-- This migration:
--   1. Adds `wallet_address` columns to claims, bits_balance, bits_transactions.
--   2. Makes the legacy `user_id` / `claimed_by_user` columns nullable so we
--      can keep them around for future Supabase-Auth integration without a
--      breaking change. For PK columns we drop the constraint first.
--   3. Adds indexes on wallet_address for fast lookups.
--   4. Adds the `solana_config` table for Bubblegum tree address persistence.
--
-- All statements use IF EXISTS / IF NOT EXISTS so the migration is safe to
-- re-run if a previous attempt failed mid-way.
--
-- Apply via Supabase SQL Editor after 001.
-- =============================================================================

-- 1. claims (claimed_by_user is FK, not PK — easy)
alter table public.claims
  alter column claimed_by_user drop not null;

alter table public.claims
  add column if not exists wallet_address text;

update public.claims set wallet_address = '' where wallet_address is null;
alter table public.claims
  alter column wallet_address set not null;

create index if not exists idx_claims_wallet on public.claims(wallet_address);

-- 2. bits_balance — user_id IS the primary key in 001. Postgres won't let us
-- DROP NOT NULL on a PK column, so we drop the PK first, then make user_id
-- nullable, then promote wallet_address to a unique index.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'bits_balance'
      and constraint_type = 'PRIMARY KEY'
  ) then
    execute 'alter table public.bits_balance drop constraint bits_balance_pkey';
  end if;
end $$;

alter table public.bits_balance
  alter column user_id drop not null;

alter table public.bits_balance
  add column if not exists wallet_address text;

-- A surrogate PK on `id` if not already present (so the table still has one).
alter table public.bits_balance
  add column if not exists id uuid default uuid_generate_v4();

update public.bits_balance set id = uuid_generate_v4() where id is null;
alter table public.bits_balance alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'bits_balance'
      and constraint_type = 'PRIMARY KEY'
  ) then
    execute 'alter table public.bits_balance add primary key (id)';
  end if;
end $$;

create unique index if not exists idx_bits_balance_wallet
  on public.bits_balance(wallet_address)
  where wallet_address is not null;

-- 3. bits_transactions — PK is `id`, user_id is just a regular column.
alter table public.bits_transactions
  alter column user_id drop not null;

alter table public.bits_transactions
  add column if not exists wallet_address text;

create index if not exists idx_bits_tx_wallet
  on public.bits_transactions(wallet_address, created_at desc);

-- 4. solana_config — single-row config table for Bubblegum tree address
-- (created once via scripts/create-tree.ts) and any other on-chain refs.
create table if not exists public.solana_config (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table public.solana_config enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'solana_config'
      and policyname = 'solana_config_service_role_all'
  ) then
    create policy "solana_config_service_role_all"
      on public.solana_config
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

-- =============================================================================
-- End of 002_claims_wallet.sql
-- =============================================================================
