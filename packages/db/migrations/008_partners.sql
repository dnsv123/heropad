-- =============================================================================
-- HeroPad — Migration 008: referral partners
-- =============================================================================
-- Why: growth past the founder's own city depends on people who bring cafés and
-- earn a share of what those cafés pay. A contract can promise a percentage;
-- what makes a partner trust it is seeing their own venues and the amount owed,
-- computed from the same rows the invoice is. This table is that ledger.
--
-- Access model mirrors venues exactly: the admin creates the partner and gets a
-- one-time CLAIM TOKEN, the partner logs in with their own account and types
-- that token once. Knowing the email is not enough to become a partner.
--
-- A partner sees ONLY their own venues, and never customer data of any kind —
-- not codes, not counts, not the venue's own statistics, which belong to the
-- café. Enforced in the API, not merely in the UI.
--
-- Apply via Supabase SQL Editor after 007. Safe to re-run.
-- =============================================================================

create table if not exists public.partners (
  id              uuid primary key default uuid_generate_v4(),
  -- Short human-quotable referral code, e.g. 'SB-ANDREI'. Shown to the partner,
  -- written on venues they bring.
  code            text not null unique,
  display_name    text not null,
  city            text,
  -- Contact address for us only. Partners are business contacts, not end users;
  -- HeroPad remains the controller and never exposes this to venues.
  email           text,
  -- Set when the partner claims the account with their claim token.
  identity_id     uuid references public.user_identity(id) on delete set null,
  claim_token     text,
  -- Share of each referred venue's monthly fee, in percent.
  commission_pct  numeric(5,2) not null default 25,
  -- City exclusivity, if granted. Kept as a date so it can simply expire.
  exclusive_city  boolean not null default false,
  exclusive_until date,
  active          boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_partners_identity on public.partners(identity_id);
create index if not exists idx_partners_claim_token
  on public.partners(claim_token)
  where claim_token is not null;

-- Which partner brought this venue, and what the venue actually pays. Without
-- the fee on the venue there is nothing to take a percentage OF, so commission
-- would be a number typed by hand — exactly the thing a partner cannot trust.
alter table public.venues
  add column if not exists referred_by uuid references public.partners(id) on delete set null;

alter table public.venues
  add column if not exists monthly_fee numeric(10,2) not null default 0;

-- 'trial'      — inside the free months, pays nothing, earns no commission yet
-- 'active'     — paying; this is the only state that generates commission
-- 'paused'     — temporarily not billed
-- 'cancelled'  — gone; kept for history
alter table public.venues
  add column if not exists billing_status text not null default 'trial'
    check (billing_status in ('trial', 'active', 'paused', 'cancelled'));

-- When the venue started paying — the clawback window ("no commission if the
-- café leaves within 3 months") is measured from here.
alter table public.venues
  add column if not exists paid_since date;

create index if not exists idx_venues_referred_by
  on public.venues(referred_by)
  where referred_by is not null;

-- Service-role only, like every other table here: the API is the sole path in.
alter table public.partners enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='partners'
      and policyname='partners_service_role_all') then
    create policy "partners_service_role_all" on public.partners
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ===== VERIFICARE (trebuie să iasă: 1, 1, 1, 1) =====
select
  (select count(*) from information_schema.tables
    where table_name='partners') as tabel_parteneri_din_1,
  (select count(*) from information_schema.columns
    where table_name='venues' and column_name='referred_by') as adusa_de_din_1,
  (select count(*) from information_schema.columns
    where table_name='venues' and column_name='monthly_fee') as abonament_din_1,
  (select count(*) from information_schema.columns
    where table_name='venues' and column_name='billing_status') as status_plata_din_1;

-- =============================================================================
-- End of 008_partners.sql
-- =============================================================================
