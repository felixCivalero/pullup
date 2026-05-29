-- 045_profiles_brand.sql
-- Host brand identity — five tokens that cascade to every guest-facing
-- surface (event page, email confirms, WhatsApp signature + cover overlay).
-- One brand per host; no per-event overrides at this layer. If a host
-- needs a different brand, they need a different account.
--
-- All columns nullable. Null on EVERY field = host hasn't set a brand =
-- guest-facing surfaces fall back to PullUp's neutral defaults. The moment
-- a host saves any value, the brand is "active" everywhere automatically.
--
-- Idempotent: safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS brand_primary_color  TEXT,
  ADD COLUMN IF NOT EXISTS brand_background     TEXT,
  ADD COLUMN IF NOT EXISTS brand_text_color     TEXT,
  ADD COLUMN IF NOT EXISTS brand_font_family    TEXT,
  ADD COLUMN IF NOT EXISTS brand_logo_url       TEXT;

-- Hex format check (#RGB or #RRGGBB). Allows null for "auto" / unset.
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_brand_primary_color_hex;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_brand_primary_color_hex
  CHECK (brand_primary_color IS NULL OR brand_primary_color ~ '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$');

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_brand_background_hex;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_brand_background_hex
  CHECK (brand_background IS NULL OR brand_background ~ '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$');

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_brand_text_color_hex;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_brand_text_color_hex
  CHECK (brand_text_color IS NULL OR brand_text_color ~ '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$');

COMMENT ON COLUMN profiles.brand_primary_color IS
  'Host-chosen accent. CTAs, links, button bg on event pages + emails. e.g. #ec178f';
COMMENT ON COLUMN profiles.brand_background IS
  'Event page + email canvas color. e.g. #0a0a0a (dark) or #fffaf0 (cream).';
COMMENT ON COLUMN profiles.brand_text_color IS
  'Body ink. NULL = auto-contrast from brand_background at render-time.';
COMMENT ON COLUMN profiles.brand_font_family IS
  'Enum name from the curated webfont list — Inter, Playfair, Space Grotesk, etc.';
COMMENT ON COLUMN profiles.brand_logo_url IS
  'Optional. Sits in event-page header + email header. Square or wide.';
