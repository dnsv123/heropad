-- =============================================================================
-- HeroPad — Migration 019: date de facturare + istoric facturi (Oblio)
-- =============================================================================
-- Ce rezolvă: nu exista niciun loc unde să scrie datele de firmă ale unei
-- cafenele (denumire, CUI, adresă) și nici dacă factura lunii a fost emisă.
-- Cu 3 localuri ții minte; cu 30 nu, iar contabila nu poate lucra din
-- memoria ta.
--
-- CE NU FACE MIGRAREA ASTA, INTENȚIONAT: nu adaugă încă o coloană de preț.
-- `venues.monthly_fee`, `venues.billing_status` și `venues.paid_since` există
-- din 008 și sunt deja sursa după care se calculează comisionul partenerilor.
-- Dacă prețul ar fi scris în două locuri, într-o zi factura ar spune una și
-- comisionul altceva — și n-ai avea de unde ști care e adevărul. Prețul are
-- un singur loc: `venues`.
--
-- Deci aici intră DOAR ce lipsea:
--
--   venue_billing   — datele de pe factură (firmă, CUI, adresă, email
--                     contabilitate) + ziua de facturare, TVA-ul și bifa
--                     `recurring`. O singură linie per local.
--
--   venue_invoices  — o linie per local per lună, scrisă când factura chiar
--                     a fost emisă în Oblio. Nu se recalculează niciodată:
--                     e o consemnare, exact ca partner_payouts.
--
-- Gardul anti-dublură e `uq_venue_invoices_period`: unique (venue_id, period).
-- Dacă jobul lunar rulează de două ori — sau apeși butonul de două ori — a
-- doua încercare pică pe constrângere în loc să emită a doua factură. Într-un
-- sistem de facturare automat, ăsta e singurul lucru care chiar contează.
--
-- TVA: `vat_rate` e 0 implicit, pentru o firmă neplătitoare de TVA. Confirmă
-- cu contabila înainte de prima factură. Prețurile publice (99/199/299 lei)
-- sunt tratate ca preț FINAL; dacă se aplică TVA, el se consideră inclus.
--
-- Se aplică din Supabase SQL Editor, după 018. Se poate rula de mai multe ori.
-- =============================================================================

-- ---- Datele de pe factură ---------------------------------------------------
create table if not exists public.venue_billing (
  id             uuid primary key default uuid_generate_v4(),
  venue_id       uuid not null references public.venues(id) on delete cascade,

  -- Firma clientului, exact cum apare pe factură.
  company_name   text not null,
  cui            text not null,
  reg_com        text,
  address        text,
  city           text,
  county         text,
  country        text not null default 'Romania',
  -- Unde pleacă factura. Separat de emailul public al localului: cafeneaua și
  -- contabilitatea ei sunt aproape niciodată aceeași adresă.
  invoice_email  text,

  -- Ziua din lună în care se emite. Maxim 28, ca să existe și în februarie.
  billing_day    int not null default 1 check (billing_day between 1 and 28),
  -- Bifa cerută: false = nu se mai emite nimic automat, dar contractul și
  -- istoricul rămân. O pauză nu e o ștergere.
  recurring      boolean not null default true,
  vat_rate       numeric(5,2) not null default 0 check (vat_rate >= 0 and vat_rate <= 100),

  -- Cât ține pilotul gratuit. Cât timp e în viitor, jobul lunar sare peste.
  trial_ends_at  timestamptz,
  note           text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Un singur set de date de facturare per local.
create unique index if not exists uq_venue_billing_venue
  on public.venue_billing(venue_id);

-- Interogarea jobului lunar: "cine se facturează azi".
create index if not exists idx_venue_billing_due
  on public.venue_billing(recurring, billing_day)
  where recurring = true;

alter table public.venue_billing enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='venue_billing'
      and policyname='venue_billing_service_role_all') then
    create policy "venue_billing_service_role_all" on public.venue_billing
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ---- Istoricul facturilor ---------------------------------------------------
create table if not exists public.venue_invoices (
  id             uuid primary key default uuid_generate_v4(),
  venue_id       uuid not null references public.venues(id) on delete cascade,

  -- Luna facturată, 'YYYY-MM'. Text, pentru că e o perioadă, nu o zi.
  period         text not null check (period ~ '^\d{4}-\d{2}$'),
  amount         numeric(10,2) not null check (amount >= 0),
  currency       text not null default 'RON',

  -- Ce a răspuns Oblio. Seria + numărul sunt identitatea legală a facturii;
  -- link-ul e PDF-ul pe care îl dai clientului și contabilei.
  oblio_series   text,
  oblio_number   text,
  oblio_link     text,
  issued_at      timestamptz not null default now(),
  due_at         timestamptz,

  -- Încasarea. Null = neplătită. Se bifează după extrasul bancar — sau
  -- automat, dacă vreodată intră un procesator de plăți.
  paid_at        timestamptz,
  payment_method text check (payment_method in ('bank_transfer','card','cash','other')),

  note           text,
  created_at     timestamptz not null default now()
);

-- GARDUL: o singură factură per local per lună. Dacă jobul rulează de două
-- ori, a doua oară pică aici — și exact asta vrem să se întâmple.
create unique index if not exists uq_venue_invoices_period
  on public.venue_invoices(venue_id, period);

-- "Ce am emis și nu s-a încasat" — ecranul pe care îl deschizi lunar.
create index if not exists idx_venue_invoices_unpaid
  on public.venue_invoices(issued_at desc)
  where paid_at is null;

create index if not exists idx_venue_invoices_venue
  on public.venue_invoices(venue_id, period desc);

alter table public.venue_invoices enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='venue_invoices'
      and policyname='venue_invoices_service_role_all') then
    create policy "venue_invoices_service_role_all" on public.venue_invoices
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ===== VERIFICARE (trebuie să iasă: 2, true) =====
select
  (select count(*) from information_schema.tables
    where table_name in ('venue_billing','venue_invoices')) as tabele_din_2,
  (select count(*) > 0 from pg_indexes
    where indexname = 'uq_venue_invoices_period') as gard_antidublura;

-- =============================================================================
-- End of 019_billing.sql
-- =============================================================================
