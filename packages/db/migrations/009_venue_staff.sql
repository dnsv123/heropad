-- =============================================================================
-- HeroPad — Migration 009: staff accounts per venue
-- =============================================================================
-- Why: stamps.granted_by has recorded who granted every stamp since migration
-- 004, but a venue had exactly one account — the owner — so the column always
-- said "the owner" and the anti-fraud value it exists for was unreachable.
-- With staff accounts the transaction history finally answers the question a
-- café owner actually has: which of my people gave that away.
--
-- Access model, third time and deliberately identical to venues and partners:
-- the owner creates the staff member and gets a one-time CODE, the person logs
-- in with their own account and types it once. One flow to learn, one flow to
-- get wrong.
--
-- Roles: 'staff' works the counter (grant, correct, redeem, scan). Only the
-- owner sees statistics, transaction history and campaign settings — an
-- employee has no business reading the venue's numbers, and the history is
-- partly a record OF them.
--
-- Apply via Supabase SQL Editor after 008. Safe to re-run.
-- =============================================================================

create table if not exists public.venue_staff (
  id            uuid primary key default uuid_generate_v4(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  -- Set once the person claims the account with their code.
  identity_id   uuid references public.user_identity(id) on delete set null,
  -- What the owner calls them in the list. Not identity, just a label the
  -- owner recognises: "Ana", "tura de seară".
  display_name  text not null,
  role          text not null default 'staff' check (role in ('staff', 'manager')),
  claim_token   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_venue_staff_venue on public.venue_staff(venue_id);
create index if not exists idx_venue_staff_identity
  on public.venue_staff(identity_id)
  where identity_id is not null;
create index if not exists idx_venue_staff_token
  on public.venue_staff(claim_token)
  where claim_token is not null;

-- One person cannot hold two staff seats at the same venue.
create unique index if not exists uq_venue_staff_identity
  on public.venue_staff(venue_id, identity_id)
  where identity_id is not null;

-- How many seats the venue's plan includes. Enforced in the API; kept on the
-- row so an upgrade is a value change rather than a deploy.
alter table public.venues
  add column if not exists staff_seats int not null default 2;

alter table public.venue_staff enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='venue_staff'
      and policyname='venue_staff_service_role_all') then
    create policy "venue_staff_service_role_all" on public.venue_staff
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ===== VERIFICARE (trebuie să iasă: 1, 1) =====
select
  (select count(*) from information_schema.tables
    where table_name='venue_staff') as tabel_angajati_din_1,
  (select count(*) from information_schema.columns
    where table_name='venues' and column_name='staff_seats') as locuri_din_1;

-- =============================================================================
-- End of 009_venue_staff.sql
-- =============================================================================
