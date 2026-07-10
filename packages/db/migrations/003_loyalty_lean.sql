-- =============================================================================
-- HeroPad — Migration 003: Loyalty module (LEAN / validation phase)
-- =============================================================================
-- Scope: the minimum schema needed to validate the B2B loyalty flow with ONE
-- real café — tap NFC / scan QR → stamp → Power Meter → reward.
--
-- KEY DECISION (off-chain stamps): stamps are plain Postgres rows, NOT cNFTs.
-- Minting at the counter would add seconds of on-chain latency per coffee for
-- zero customer benefit. The collectible / milestone NFT is minted only when a
-- reward is redeemed — and that NFT will live on MultiversX (built later,
-- post-validation). We do NOT touch the existing Solana plumbing here.
--
-- IDENTITY: like migration 002, HeroPad uses Privy (not Supabase Auth), so
-- `auth.uid()` does not match our users. All loyalty tables are therefore
-- SERVICE-ROLE ONLY (RLS enabled, single service_role policy) — the frontend
-- never queries them directly, it goes through apps/api. This mirrors how
-- `collectibles_catalog` is already locked down in 001.
--
-- DEFERRED (columns present but unused until post-validation, kept nullable so
-- adding the logic later needs no migration): merchant ownership, subscription
-- tier, Hall-of-Heroes identity linking (gmail / mvx_wallet / phantom_wallet),
-- MultiversX milestone mint tx.
--
-- All statements use IF NOT EXISTS so the migration is safe to re-run.
-- Apply via Supabase SQL Editor after 002.
-- =============================================================================

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. user_identity
--    The canonical person behind one or more login methods. The anchor that
--    stamps / rewards point at. For validation we only populate privy_id +
--    solana_wallet (+ encrypted email). The gmail / mvx_wallet / phantom_wallet
--    columns exist NOW so the future Hall-of-Heroes linking needs no migration,
--    but no linking logic is built yet.
-- -----------------------------------------------------------------------------
create table if not exists public.user_identity (
  id               uuid primary key default uuid_generate_v4(),
  privy_id         text unique,                 -- Privy DID (did:privy:...)
  solana_wallet    text,                        -- embedded wallet address
  email_encrypted  text,                        -- AES-256-GCM at rest (PII)
  gmail            text,                        -- DEFERRED: HoH linking
  mvx_wallet       text,                        -- DEFERRED: MultiversX side
  phantom_wallet   text,                        -- DEFERRED: external Solana
  created_at       timestamptz not null default now()
);

create index if not exists idx_user_identity_solana on public.user_identity(solana_wallet);

alter table public.user_identity enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='user_identity'
      and policyname='user_identity_service_role_all') then
    create policy "user_identity_service_role_all" on public.user_identity
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. venues
--    A participating café. For validation YOU seed one row by hand (you are the
--    test merchant — no signup wizard yet). `nfc_secret` signs the NFC/QR URL
--    (HMAC), rotated by cron later. `slug` drives the public URL
--    /loyalty/<slug>. owner_identity_id + tier are DEFERRED (nullable).
-- -----------------------------------------------------------------------------
create table if not exists public.venues (
  id                 uuid primary key default uuid_generate_v4(),
  slug               text not null unique,                 -- e.g. 'cafe-victor'
  name               text not null,
  gps_lat            double precision,                     -- for geofencing later
  gps_lng            double precision,
  stamps_required    int  not null default 10,             -- stamps per reward
  branding           jsonb not null default '{}'::jsonb,   -- colors/logo overrides
  nfc_secret         text,                                 -- HMAC key for this venue's URLs
  active             boolean not null default true,
  owner_identity_id  uuid references public.user_identity(id) on delete set null, -- DEFERRED
  tier               text default 'starter',               -- DEFERRED: billing
  created_at         timestamptz not null default now()
);

create index if not exists idx_venues_slug on public.venues(slug);

alter table public.venues enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='venues'
      and policyname='venues_service_role_all') then
    create policy "venues_service_role_all" on public.venues
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. stamps
--    One row per stamp. Pure off-chain — no mint. `stamp_day` is a generated
--    UTC date used by the anti-fraud unique index below: max 1 stamp per
--    (user, venue, day). This is the same "let Postgres enforce it" trick the
--    claims table already uses with unique(code) — bulletproof under races.
-- -----------------------------------------------------------------------------
create table if not exists public.stamps (
  id                uuid primary key default uuid_generate_v4(),
  user_identity_id  uuid not null references public.user_identity(id) on delete cascade,
  venue_id          uuid not null references public.venues(id) on delete cascade,
  source            text not null default 'nfc' check (source in ('nfc','qr')),
  fraud_score       int  not null default 0,               -- 0=clean; raised by checks later
  created_at        timestamptz not null default now(),
  -- UTC calendar day of the stamp, computed at insert. Drives the 1/day guard.
  stamp_day         date generated always as (((created_at at time zone 'utc'))::date) stored
);

create index if not exists idx_stamps_user  on public.stamps(user_identity_id, created_at desc);
create index if not exists idx_stamps_venue on public.stamps(venue_id, created_at desc);

-- ANTI-FRAUD: one stamp per user / venue / day, enforced by the DB.
create unique index if not exists uq_stamps_one_per_day
  on public.stamps(user_identity_id, venue_id, stamp_day);

alter table public.stamps enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='stamps'
      and policyname='stamps_service_role_all') then
    create policy "stamps_service_role_all" on public.stamps
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. rewards_redeemed
--    A row when a user cashes in stamps for a reward. `stamps_consumed` records
--    how many were spent (off-chain "burn" = mark consumed; no on-chain burn).
--    `milestone_mint_tx` is DEFERRED — it will hold the MultiversX tx hash once
--    we mint the collectible/milestone NFT post-validation. Nullable, unused now.
-- -----------------------------------------------------------------------------
create table if not exists public.rewards_redeemed (
  id                 uuid primary key default uuid_generate_v4(),
  user_identity_id   uuid not null references public.user_identity(id) on delete cascade,
  venue_id           uuid not null references public.venues(id) on delete cascade,
  reward_type        text not null default 'free_item',
  stamps_consumed    int  not null,
  milestone_mint_tx  text,                                 -- DEFERRED: MultiversX
  redeemed_at        timestamptz not null default now()
);

create index if not exists idx_rewards_user  on public.rewards_redeemed(user_identity_id, redeemed_at desc);
create index if not exists idx_rewards_venue on public.rewards_redeemed(venue_id, redeemed_at desc);

alter table public.rewards_redeemed enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='rewards_redeemed'
      and policyname='rewards_redeemed_service_role_all') then
    create policy "rewards_redeemed_service_role_all" on public.rewards_redeemed
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- =============================================================================
-- End of 003_loyalty_lean.sql
--
-- NOT in this migration (built post-validation, by design):
--   * surprise_rewards (Tier 3 loot table)
--   * subscriptions / billing tables (Paddle/Lemon Squeezy)
--   * merchant onboarding / staff accounts
--   * audit_log for admin PII access (GDPR) — add before going live
--   * /api/identity/link logic for Hall of Heroes
-- =============================================================================
