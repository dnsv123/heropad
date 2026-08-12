-- =============================================================================
-- HeroPad — Migration 010: idempotency keys
-- =============================================================================
-- Why: a café's wifi drops mid-service. The barista taps +1, the request
-- leaves, the reply never arrives. Retrying is the only sane behaviour — but a
-- blind retry double-grants whenever the FIRST request actually succeeded and
-- only the response was lost, which is exactly the case a queue creates most
-- often. Without this table, offline resilience would trade a lost stamp for a
-- duplicated one.
--
-- The client sends a request id it generates once per tap and reuses on every
-- retry. The first insert wins; a retry hits the unique key, grants nothing,
-- and the caller is told the current state instead.
--
-- Rows are disposable: anything older than a day cannot still be in flight.
--
-- Apply via Supabase SQL Editor after 009. Safe to re-run.
-- =============================================================================

create table if not exists public.idempotency_keys (
  key        text primary key,
  scope      text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_idempotency_created
  on public.idempotency_keys(created_at);

alter table public.idempotency_keys enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='idempotency_keys'
      and policyname='idempotency_service_role_all') then
    create policy "idempotency_service_role_all" on public.idempotency_keys
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- Housekeeping, run whenever convenient (or from the admin panel later):
--   delete from public.idempotency_keys where created_at < now() - interval '2 days';

-- ===== VERIFICARE (trebuie să iasă: 1) =====
select (select count(*) from information_schema.tables
  where table_name='idempotency_keys') as tabel_idempotenta_din_1;

-- =============================================================================
-- End of 010_idempotency.sql
-- =============================================================================
