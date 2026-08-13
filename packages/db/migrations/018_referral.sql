-- =============================================================================
-- HeroPad — Migration 018: Adu un prieten (referral)
-- =============================================================================
-- A customer shares their loyalty page link with ?ref=<their loyalty code>.
-- The friend signs up through it, and when the friend earns their FIRST stamp
-- — a real visit, validated by a barista — both sides get BITS.
--
-- The first-stamp condition is the whole anti-abuse design: ghost accounts
-- produce nothing, because the payout gate is an event only a merchant device
-- can create. Three columns on user_identity, no new table:
--
--   referred_by          who invited them (null = organic signup)
--   referred_at          when the link was followed
--   referral_rewarded_at when the first-stamp bonus was paid — the SINGLE
--                        payment gate: the conditional update that sets it
--                        can only ever win once.
--
-- referred_by can only be recorded while the account has zero stamps, so it
-- can never be attached retroactively to an already-active customer.
--
-- Apply via Supabase SQL Editor after 017. Safe to re-run.
-- =============================================================================

alter table public.user_identity
  add column if not exists referred_by uuid
    references public.user_identity(id) on delete set null,
  add column if not exists referred_at timestamptz,
  add column if not exists referral_rewarded_at timestamptz;

-- "How many friends did X bring" reads by inviter.
create index if not exists idx_identity_referred_by
  on public.user_identity(referred_by)
  where referred_by is not null;

-- ===== VERIFICARE (trebuie să iasă: 3) =====
select
  (select count(*) from information_schema.columns
    where table_name = 'user_identity'
      and column_name in ('referred_by', 'referred_at', 'referral_rewarded_at')) as coloane_din_3;

-- =============================================================================
-- End of 018_referral.sql
-- =============================================================================
