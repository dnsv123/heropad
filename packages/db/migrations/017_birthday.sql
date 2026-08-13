-- =============================================================================
-- HeroPad — Migration 017: birthday (day + month only)
-- =============================================================================
-- The customer may OPTIONALLY tell us their birthday in the Profile — day and
-- month only, never the year. Data minimisation is the design: the year is
-- age, and age is data we have no use for. What the feature needs is exactly
-- "is today their day", so that is all we store.
--
-- The merchant never sees the date either — the counter lookup returns a
-- computed boolean ("today is this customer's birthday"), evaluated in the
-- venue's own time zone. Providing the date is the consent (voluntary, with
-- an explanation next to the field); clearing it deletes both columns.
--
-- Apply via Supabase SQL Editor after 016. Safe to re-run.
-- =============================================================================

alter table public.user_identity
  add column if not exists birthday_day int
    check (birthday_day between 1 and 31),
  add column if not exists birthday_month int
    check (birthday_month between 1 and 12),
  -- When the person set it — the consent timestamp, same idea as marketing.
  add column if not exists birthday_set_at timestamptz;

-- Day and month travel together: half a birthday is a bug, not a value.
do $$ begin
  alter table public.user_identity
    add constraint user_identity_birthday_pair
    check ((birthday_day is null) = (birthday_month is null));
exception when duplicate_object then null; end $$;

-- ===== VERIFICARE (trebuie să iasă: 3, 1) =====
select
  (select count(*) from information_schema.columns
    where table_name = 'user_identity'
      and column_name in ('birthday_day', 'birthday_month', 'birthday_set_at')) as coloane_din_3,
  (select count(*) from information_schema.table_constraints
    where table_name = 'user_identity'
      and constraint_name = 'user_identity_birthday_pair') as pereche_din_1;

-- =============================================================================
-- End of 017_birthday.sql
-- =============================================================================
