-- 023_billing_period.sql
-- Plata anuală: „plătești 10 luni, primești 12".
--
-- `monthly_fee` RĂMÂNE singura sursă a prețului. Un local anual are același
-- monthly_fee ca unul lunar (din el iese comisionul partenerului, lună de
-- lună); diferența e DOAR cum se facturează: o factură de 10 × monthly_fee
-- o dată pe an, în luna aniversară a lui `paid_since`, în loc de 12 facturi.
--
-- Rulează în Supabase → SQL Editor. Aditiv, nu atinge rânduri existente.

alter table public.venues
  add column if not exists billing_period text not null default 'monthly';

alter table public.venues
  drop constraint if exists venues_billing_period_check;

alter table public.venues
  add constraint venues_billing_period_check
  check (billing_period in ('monthly', 'annual'));

comment on column public.venues.billing_period is
  'monthly = 12 facturi/an de monthly_fee; annual = 1 factură/an de 10 × monthly_fee, în luna lui paid_since';
