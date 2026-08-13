-- =============================================================================
-- HeroPad — Migration 015: each venue keeps its own time
-- =============================================================================
-- Why: Happy Hour was evaluated in Europe/Bucharest, written into the code. A
-- café in Calgary set a window for 12:48 and watched it never fire — because
-- 12:48 in Bucharest is 03:48 where they stand. The setting saved, the panel
-- showed it, and it was simply wrong nine hours a day.
--
-- This is not a feature that was missing. It is a feature that produced a
-- confident wrong answer for any venue outside Romania, which is worse.
--
-- IANA zone name, defaulted to Europe/Bucharest so every existing café keeps
-- behaving exactly as it does today.
--
-- Apply via Supabase SQL Editor after 014. Safe to re-run.
-- =============================================================================

alter table public.venues
  add column if not exists timezone text not null default 'Europe/Bucharest';

-- ===== VERIFICARE (trebuie să iasă: 1) =====
select (select count(*) from information_schema.columns
  where table_name='venues' and column_name='timezone') as fus_orar_din_1;

-- =============================================================================
-- End of 015_venue_timezone.sql
-- =============================================================================
