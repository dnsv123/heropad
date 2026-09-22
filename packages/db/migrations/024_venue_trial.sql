-- 024_venue_trial.sql
-- Pilotul gratuit, ca dată pe local.
--
-- Până acum „trial" era doar o stare (billing_status = 'trial') fără sfârșit.
-- Butonul de plan din Admin scrie de acum data la care se termină pilotul
-- (azi + 14 zile la planurile publice, + 60 la Founding), Admin arată câte
-- zile mai sunt, iar cron-ul de facturare nu emite nimic înainte de ea.
--
-- Rulează în Supabase → SQL Editor. Aditiv, nu atinge rânduri existente.

alter table public.venues
  add column if not exists trial_ends_at timestamptz;

comment on column public.venues.trial_ends_at is
  'Sfârșitul pilotului gratuit. NULL = fără pilot sau pilot nedefinit. Cron-ul nu facturează înainte de această dată.';
