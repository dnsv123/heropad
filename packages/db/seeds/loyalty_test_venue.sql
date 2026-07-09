-- =============================================================================
-- HeroPad — Seed: one test café for loyalty validation
-- =============================================================================
-- Run AFTER migration 003_loyalty_lean.sql, in the Supabase SQL Editor.
-- This is the single venue you (Valentin) act as "merchant" for during the
-- café validation. Edit name / GPS / reward to match the real pilot café.
--
-- The slug 'cafe-victor' drives the public URL: /loyalty/cafe-victor
-- The nfc_secret here is a PLACEHOLDER — replace with a real 32+ char random
-- secret before any real-world test (it signs this venue's NFC/QR URLs).
-- =============================================================================

insert into public.venues (slug, name, gps_lat, gps_lng, stamps_required, branding, nfc_secret, active)
values (
  'cafe-victor',
  'Café Victor',
  44.4268,            -- example: Bucharest. Replace with the real café GPS.
  26.1025,
  10,                 -- stamps needed for a reward
  '{"accent":"#F5C842","tagline":"Your friendly test café","reward":"A free coffee"}'::jsonb,
  'REPLACE_WITH_REAL_32CHAR_RANDOM_SECRET________',
  true
)
on conflict (slug) do update
  set name            = excluded.name,
      gps_lat         = excluded.gps_lat,
      gps_lng         = excluded.gps_lng,
      stamps_required = excluded.stamps_required,
      branding        = excluded.branding,
      active          = excluded.active;

-- Verify:
-- select id, slug, name, stamps_required, active from public.venues where slug = 'cafe-victor';
