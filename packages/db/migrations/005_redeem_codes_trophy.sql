-- =============================================================================
-- HeroPad — Migration 005: one-time redeem codes + trophy cNFT tracking
-- =============================================================================
-- Why: redeeming with the customer's PERMANENT code let a merchant consume a
-- full card without the customer present. Now the customer generates a
-- one-time code (5-minute TTL) on their own phone when the card is full —
-- proof of presence. The barista types THAT code to redeem.
-- Also: rewards_redeemed gains trophy columns — the Solana cNFT trophy minted
-- automatically at redeem (reuses the existing Bubblegum pipeline).
--
-- Apply via Supabase SQL Editor after 004. Safe to re-run.
-- =============================================================================

-- 1. One-time redeem codes.
create table if not exists public.redeem_codes (
  id                uuid primary key default uuid_generate_v4(),
  user_identity_id  uuid not null references public.user_identity(id) on delete cascade,
  venue_id          uuid not null references public.venues(id) on delete cascade,
  code              text not null,
  expires_at        timestamptz not null,
  used_at           timestamptz,
  created_at        timestamptz not null default now()
);

-- Active (unused) codes must be unique so lookup by code is unambiguous.
create unique index if not exists uq_redeem_codes_active
  on public.redeem_codes(code)
  where used_at is null;

create index if not exists idx_redeem_codes_user
  on public.redeem_codes(user_identity_id, venue_id, created_at desc);

alter table public.redeem_codes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='redeem_codes'
      and policyname='redeem_codes_service_role_all') then
    create policy "redeem_codes_service_role_all" on public.redeem_codes
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- 2. Trophy tracking on redeemed rewards (asset id + mint tx signature).
alter table public.rewards_redeemed
  add column if not exists trophy_asset_id text;

-- (milestone_mint_tx from 003 stores the mint tx signature.)

-- ===== VERIFICARE (trebuie să iasă: 1, 1) =====
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='redeem_codes') as tabela_redeem_din_1,
  (select count(*) from information_schema.columns
    where table_name='rewards_redeemed' and column_name='trophy_asset_id') as coloana_trofeu_din_1;

-- =============================================================================
-- End of 005_redeem_codes_trophy.sql
-- =============================================================================
