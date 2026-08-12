-- =============================================================================
-- HeroPad — Migration 014: partner payout ledger
-- =============================================================================
-- Why: the partner page shows a number computed from TODAY's state. A café
-- paused on the 28th erases the whole month from the screen, and a partner
-- watching a figure that moves under them has no reason to trust it. The
-- integrity audit named this: payouts were derived from mutable current state
-- instead of being recorded when they were earned.
--
-- A payout row is a statement, not a calculation. Once written for a month it
-- does not change because a venue's status changed afterwards — which is the
-- entire point of writing it down.
--
-- One row per partner per month. `paid_at` null means owed; set means settled.
--
-- Apply via Supabase SQL Editor after 013. Safe to re-run.
-- =============================================================================

create table if not exists public.partner_payouts (
  id          uuid primary key default uuid_generate_v4(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  -- Calendar month the commission was earned in, 'YYYY-MM'. Text rather than a
  -- date because it is a period, not a day, and it is what both sides read.
  period      text not null check (period ~ '^\d{4}-\d{2}$'),
  amount      numeric(10,2) not null check (amount >= 0),
  -- How many venues it covers, for the partner to sanity-check the figure.
  venues      int not null default 0,
  paid_at     timestamptz,
  note        text,
  created_at  timestamptz not null default now()
);

-- One statement per partner per month; re-running a month updates it.
create unique index if not exists uq_partner_payouts_period
  on public.partner_payouts(partner_id, period);

create index if not exists idx_partner_payouts_partner
  on public.partner_payouts(partner_id, period desc);

alter table public.partner_payouts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='partner_payouts'
      and policyname='partner_payouts_service_role_all') then
    create policy "partner_payouts_service_role_all" on public.partner_payouts
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ===== VERIFICARE (trebuie să iasă: 1) =====
select (select count(*) from information_schema.tables
  where table_name='partner_payouts') as tabel_plati_din_1;

-- =============================================================================
-- End of 014_partner_payouts.sql
-- =============================================================================
