-- =============================================================================
-- HeroPad — Migration 007: GDPR consent + admin audit log
-- =============================================================================
-- Three things, all required before the first paying café:
--
-- 1. MARKETING CONSENT — storing an email for the service is one legal basis
--    (contract); emailing a newsletter is another (consent). We record WHEN it
--    was given/withdrawn and WHICH text version was shown, because "we have
--    consent" is only defensible if you can prove what the person agreed to.
--
-- 2. ADMIN AUDIT LOG — every time the operator resolves a loyalty code to a
--    real person (support), the access is written down: who, when, what, why.
--    GDPR Art. 5(2) accountability.
--
-- 3. ERASURE LOG — proof that a deletion request was executed, kept after the
--    personal data itself is gone (no PII in it: only the hashed subject).
--
-- Apply via Supabase SQL Editor after 006. Safe to re-run.
-- =============================================================================

-- 1. Marketing consent on the identity ---------------------------------------
alter table public.user_identity
  add column if not exists marketing_consent boolean not null default false;
alter table public.user_identity
  add column if not exists marketing_consent_at timestamptz;
alter table public.user_identity
  add column if not exists marketing_consent_version text;
-- Email is stored ONLY once marketing consent is given (contract-basis flows
-- don't need it locally — Privy holds the account email).
alter table public.user_identity
  add column if not exists marketing_email text;

create index if not exists idx_identity_marketing
  on public.user_identity(marketing_consent)
  where marketing_consent = true;

-- 2. Admin access / action audit ---------------------------------------------
create table if not exists public.admin_audit_log (
  id             uuid primary key default uuid_generate_v4(),
  admin_privy_id text not null,
  action         text not null,            -- 'support_lookup' | 'export' | 'erase' | ...
  subject_code   text,                     -- loyalty code acted on, if any
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_audit_created on public.admin_audit_log(created_at desc);
create index if not exists idx_audit_admin on public.admin_audit_log(admin_privy_id, created_at desc);

alter table public.admin_audit_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='admin_audit_log'
      and policyname='admin_audit_service_role_all') then
    create policy "admin_audit_service_role_all" on public.admin_audit_log
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- 3. Erasure record (survives the deletion; carries no personal data) ---------
create table if not exists public.erasure_log (
  id             uuid primary key default uuid_generate_v4(),
  privy_id_hash  text not null,            -- sha256, not the id itself
  erased_by      text not null,
  rows_deleted   jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

alter table public.erasure_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='erasure_log'
      and policyname='erasure_log_service_role_all') then
    create policy "erasure_log_service_role_all" on public.erasure_log
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ===== VERIFICARE (trebuie să iasă: 4, 1, 1) =====
select
  (select count(*) from information_schema.columns
    where table_name='user_identity'
      and column_name in ('marketing_consent','marketing_consent_at',
                          'marketing_consent_version','marketing_email')) as consimtamant_din_4,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='admin_audit_log') as audit_din_1,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='erasure_log') as stergere_din_1;

-- =============================================================================
-- End of 007_gdpr_consent_audit.sql
-- =============================================================================
