-- =============================================================================
-- HeroPad — Migration 022: planul și extra-opțiunile unui local
-- =============================================================================
-- Ce rezolvă: până acum planul unui local se GHICEA din preț (99 → Starter,
-- 199 → Branded…). Merge până în ziua în care dai un discount sau adaugi un
-- extra, și atunci prețul nu mai spune nimic despre ce a primit localul.
--
-- Două coloane pe `venues`:
--
--   plan    'starter' | 'branded' | 'growth' | 'chain' | 'founding' | null
--           Ce pachet are. null = neconfigurat încă (localurile vechi).
--
--   addons  jsonb, listă de extra-opțiuni aplicate:
--           [{ "key": "extra_seat", "label": "Cont de angajat în plus",
--              "price": 20, "qty": 1 }]
--           Prețul din listă e cel de la momentul adăugării — dacă schimbi
--           prețul unui extra în cod, localurile existente rămân la ce li
--           s-a promis.
--
-- `monthly_fee` RĂMÂNE singura sursă a prețului (din ea ies factura și
-- comisionul partenerului). Butonul de plan din Admin o setează = baza
-- planului + suma extra-opțiunilor. Aici doar se ține minte DE CE e cât e.
--
-- Se aplică din Supabase SQL Editor, după 021. Se poate rula de mai multe ori.
-- =============================================================================

alter table public.venues
  add column if not exists plan text
    check (plan is null or plan in ('starter','branded','growth','chain','founding')),
  add column if not exists addons jsonb not null default '[]'::jsonb;

-- ===== VERIFICARE (trebuie să iasă: 2) =====
select (select count(*) from information_schema.columns
  where table_name='venues' and column_name in ('plan','addons')) as coloane_din_2;

-- =============================================================================
-- End of 022_venue_plan.sql
-- =============================================================================
