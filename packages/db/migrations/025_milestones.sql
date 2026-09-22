-- 025_milestones.sql
-- Trepte de recompensă pe drumul către cardul plin.
--
-- Până acum cardul avea o singură recompensă, la capăt (stamps_required).
-- Localul poate defini acum și trepte intermediare — „la 3 bonusuri: cartofi
-- prăjiți, la 6: un burger" — fiecare cu o poză. Un client care ajunge la o
-- treaptă o cere la tejghea (cu același cod de recompensă de pe telefonul
-- lui), barista o validează, iar cardul MERGE MAI DEPARTE: treapta nu
-- consumă bonusuri și nu resetează cardul. Doar cardul plin consumă, ca
-- până acum, și doar el aduce trofeul.
--
-- Două tabele noi, nimic modificat la cele vechi: rewards_redeemed rămâne
-- „carduri pline" și toate statisticile care numără carduri rămân corecte.
--
-- Rulează în Supabase → SQL Editor. Aditiv.

-- 1. Treptele definite de local (max 4 per local, impuse de API).
create table if not exists public.venue_milestones (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  at          int  not null check (at >= 1),           -- la câte bonusuri
  label       text not null,                            -- „Cartofi prăjiți"
  image       text,                                     -- data:image/webp, ≤256 px, pusă de patron
  created_at  timestamptz not null default now(),
  unique (venue_id, at)
);

create index if not exists idx_venue_milestones_venue on public.venue_milestones(venue_id, at);

alter table public.venue_milestones enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='venue_milestones'
      and policyname='venue_milestones_service_role_all') then
    create policy "venue_milestones_service_role_all" on public.venue_milestones
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- 2. Treptele revendicate. `card_cycle` = al câtelea card era în lucru
--    (numărul de carduri pline deja închise la acel local). O treaptă se poate
--    lua o singură dată per card, iar unicitatea o impune Postgres, nu codul.
create table if not exists public.milestone_claims (
  id                     uuid primary key default uuid_generate_v4(),
  user_identity_id       uuid not null references public.user_identity(id) on delete cascade,
  venue_id               uuid not null references public.venues(id) on delete cascade,
  milestone_at           int  not null,
  label                  text not null,                 -- eticheta la momentul validării
  card_cycle             int  not null,
  validated_by           uuid references public.user_identity(id) on delete set null, -- cine a validat la tejghea
  claimed_at             timestamptz not null default now(),
  unique (user_identity_id, venue_id, milestone_at, card_cycle)
);

create index if not exists idx_milestone_claims_user  on public.milestone_claims(user_identity_id, venue_id);
create index if not exists idx_milestone_claims_venue on public.milestone_claims(venue_id, claimed_at desc);

alter table public.milestone_claims enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='milestone_claims'
      and policyname='milestone_claims_service_role_all') then
    create policy "milestone_claims_service_role_all" on public.milestone_claims
      for all to service_role using (true) with check (true);
  end if;
end $$;

comment on table public.venue_milestones is
  'Trepte de recompensă intermediare, definite de local. Nu consumă bonusuri; cardul plin rămâne în rewards_redeemed.';
comment on table public.milestone_claims is
  'O treaptă validată la tejghea. Unică per (client, local, treaptă, card).';
