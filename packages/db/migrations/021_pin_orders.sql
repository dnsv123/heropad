-- =============================================================================
-- HeroPad — Migration 021: comenzile de premii fizice (pin-uri) către localuri
-- =============================================================================
-- Ce rezolvă: pin-urile sunt obiecte fizice care pleacă de la tine către
-- cafenele. Primele 20 sunt gratis (setul de start), următoarele se cumpără
-- în pachete. Fără un registru, în două luni nu mai știi cine ce a primit,
-- cine a plătit și cât stoc mai are fiecare local în vitrină.
--
-- Un singur tabel: o linie = un lot de pin-uri (un model, o cantitate) care
-- merge la un local. Stocul unui local pentru un model se DERIVĂ, nu se
-- scrie: suma loturilor livrate − revendicările predate acolo (reward_claims
-- are venue_id + reward_id). Un număr calculat nu poate rămâne în urmă.
--
--   kind      'starter'  = gratis, din pachetul localului
--             'purchase' = cumpărat de local, la unit_price
--   status    'planned'  → 'sent' → 'paid'   (starter se oprește la 'sent')
--
-- Se aplică din Supabase SQL Editor, după 020. Se poate rula de mai multe ori.
-- =============================================================================

create table if not exists public.pin_orders (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  reward_id   uuid not null references public.reward_items(id) on delete restrict,
  qty         int not null check (qty > 0),
  kind        text not null default 'purchase' check (kind in ('starter','purchase')),
  -- Preț per bucată, lei. 0 pentru setul de start.
  unit_price  numeric(10,2) not null default 0 check (unit_price >= 0),
  status      text not null default 'planned' check (status in ('planned','sent','paid')),
  note        text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  paid_at     timestamptz
);

create index if not exists idx_pin_orders_venue
  on public.pin_orders(venue_id, created_at desc);

-- „Ce am de trimis" — lista de pe birou.
create index if not exists idx_pin_orders_open
  on public.pin_orders(status, created_at)
  where status <> 'paid';

alter table public.pin_orders enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='pin_orders'
      and policyname='pin_orders_service_role_all') then
    create policy "pin_orders_service_role_all" on public.pin_orders
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ===== VERIFICARE (trebuie să iasă: 1) =====
select (select count(*) from information_schema.tables
  where table_name='pin_orders') as tabel_comenzi_din_1;

-- =============================================================================
-- End of 021_pin_orders.sql
-- =============================================================================
