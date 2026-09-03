-- =============================================================================
-- HeroPad — Migration 020: catalogul de premii (ce poți lua cu BITS)
-- =============================================================================
-- Ce rezolvă: BITS era un număr fără magazin. Clientul strângea puncte și nu
-- avea nicăieri un răspuns la „și ce fac cu ele?". Ioana a spus-o direct în
-- call: fără o destinație concretă, tot ce vede un patron e miros de crypto.
--
-- Două tabele:
--
--   reward_items   — CATALOGUL. Un pin, un sticker, un comic. Poză, preț în
--                    BITS, stoc, la ce localuri se ridică (null = la oricare).
--
--   reward_claims  — REVENDICĂRILE. Clientul apasă „Revendică" în aplicație:
--                    BITS-ii i se scad PE LOC, primește un cod de 6 caractere,
--                    vine la casă, barista introduce codul și îi dă produsul.
--                    Dacă nu vine în 14 zile, codul expiră și BITS-ii se
--                    întorc singuri.
--
-- Gardul: `uq_reward_claims_one_pending` — un client nu poate avea două
-- revendicări deschise pe același produs. Două apăsări rapide pe „Revendică"
-- produc UN cod, nu două debitări.
--
-- Se aplică din Supabase SQL Editor, după 019. Se poate rula de mai multe ori.
-- =============================================================================

create table if not exists public.reward_items (
  id           uuid primary key default uuid_generate_v4(),
  slug         text not null unique,
  name         text not null,
  description  text,
  -- Cale relativă în /public (ex. /rewards/pin-supervictor.webp) sau URL.
  image_url    text,
  price_bits   int not null check (price_bits > 0),
  -- null = nelimitat. Scade la revendicare, crește înapoi la expirare.
  stock        int check (stock is null or stock >= 0),
  -- null = se ridică de la orice local partener. Altfel, doar de la acestea.
  venue_ids    uuid[],
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_reward_items_active
  on public.reward_items(active, sort_order);

alter table public.reward_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='reward_items'
      and policyname='reward_items_service_role_all') then
    create policy "reward_items_service_role_all" on public.reward_items
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ---- Revendicările ----------------------------------------------------------
create table if not exists public.reward_claims (
  id                uuid primary key default uuid_generate_v4(),
  reward_id         uuid not null references public.reward_items(id) on delete restrict,
  user_identity_id  uuid not null references public.user_identity(id) on delete cascade,
  -- Cheia registrului BITS (bits_transactions e pe wallet, nu pe identitate).
  wallet_address    text not null,
  -- Codul spus la casă. 6 caractere, același alfabet ca la codurile de client.
  code              text not null,
  -- Prețul la momentul revendicării — dacă schimbi prețul în catalog după,
  -- refund-ul la expirare returnează exact cât s-a luat.
  price_bits        int not null check (price_bits > 0),
  status            text not null default 'pending'
                      check (status in ('pending','fulfilled','expired','cancelled')),
  -- Unde și cine a predat produsul. Null cât e pending.
  venue_id          uuid references public.venues(id) on delete set null,
  fulfilled_by      uuid references public.user_identity(id) on delete set null,
  expires_at        timestamptz not null,
  fulfilled_at      timestamptz,
  created_at        timestamptz not null default now()
);

-- Un singur cod deschis per (client, produs). Asta e anti-dublul-click.
create unique index if not exists uq_reward_claims_one_pending
  on public.reward_claims(user_identity_id, reward_id)
  where status = 'pending';

-- Codul e unic cât e deschis; după ce se consumă, se poate refolosi.
create unique index if not exists uq_reward_claims_code_live
  on public.reward_claims(code)
  where status = 'pending';

create index if not exists idx_reward_claims_identity
  on public.reward_claims(user_identity_id, created_at desc);

-- „Ce s-a predat la localul X" — pentru istoricul patronului și pentru stoc.
create index if not exists idx_reward_claims_venue
  on public.reward_claims(venue_id, fulfilled_at desc)
  where venue_id is not null;

alter table public.reward_claims enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='reward_claims'
      and policyname='reward_claims_service_role_all') then
    create policy "reward_claims_service_role_all" on public.reward_claims
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ===== VERIFICARE (trebuie să iasă: 2, true) =====
select
  (select count(*) from information_schema.tables
    where table_name in ('reward_items','reward_claims')) as tabele_din_2,
  (select count(*) > 0 from pg_indexes
    where indexname = 'uq_reward_claims_one_pending') as gard_dublu_click;

-- =============================================================================
-- End of 020_rewards_catalog.sql
-- =============================================================================
