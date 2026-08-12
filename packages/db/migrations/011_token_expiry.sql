-- =============================================================================
-- HeroPad — Migration 011: activation codes expire
-- =============================================================================
-- Why: the security audit measured what the staff activation code is actually
-- worth. Six characters from a 31-symbol alphabet is 29.7 bits — and because
-- the lookup matches a token against EVERY venue on the platform at once, one
-- guess is tested against every outstanding code simultaneously. With fifty
-- cafés each holding a pending seat, the search space collapses to roughly
-- nine million guesses. That is minutes of distributed traffic, not years.
--
-- A stolen seat can grant, revoke and redeem — and a redemption mints a cNFT
-- paid for by our own wallet.
--
-- Three changes, together: longer codes (handled in the API), a per-account
-- attempt limit (also in the API), and this — codes that stop working. An
-- expiry is what bounds N: a code nobody used within two days was never going
-- to be used, and every hour it stays alive is an hour it can be guessed.
--
-- Existing codes get a window from now rather than being invalidated, so a
-- café mid-setup is not locked out by a deploy.
--
-- Apply via Supabase SQL Editor after 010. Safe to re-run.
-- =============================================================================

alter table public.venue_staff
  add column if not exists claim_expires_at timestamptz;

alter table public.partners
  add column if not exists claim_expires_at timestamptz;

alter table public.venues
  add column if not exists claim_expires_at timestamptz;

-- Give anything already issued a fresh, bounded life instead of killing it.
update public.venue_staff
  set claim_expires_at = now() + interval '48 hours'
  where claim_token is not null and claim_expires_at is null;

update public.partners
  set claim_expires_at = now() + interval '14 days'
  where claim_token is not null and claim_expires_at is null;

-- Venue setup runs on a slower human schedule (a café signs, then installs).
update public.venues
  set claim_expires_at = now() + interval '14 days'
  where claim_token is not null and claim_expires_at is null;

-- A collision would make the single-row lookups throw a 500 rather than say
-- "invalid code". Cheap to prevent, and it keeps the error honest.
create unique index if not exists uq_venue_staff_claim_token
  on public.venue_staff(claim_token)
  where claim_token is not null;

create unique index if not exists uq_partners_claim_token
  on public.partners(claim_token)
  where claim_token is not null;

create unique index if not exists uq_venues_claim_token
  on public.venues(claim_token)
  where claim_token is not null;

-- ===== VERIFICARE (trebuie să iasă: 1, 1, 1) =====
select
  (select count(*) from information_schema.columns
    where table_name='venue_staff' and column_name='claim_expires_at') as angajati_din_1,
  (select count(*) from information_schema.columns
    where table_name='partners' and column_name='claim_expires_at') as parteneri_din_1,
  (select count(*) from information_schema.columns
    where table_name='venues' and column_name='claim_expires_at') as localuri_din_1;

-- =============================================================================
-- End of 011_token_expiry.sql
-- =============================================================================
