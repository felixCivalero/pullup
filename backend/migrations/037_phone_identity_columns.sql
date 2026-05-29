-- 037_phone_identity_columns.sql
-- Promote phone-number from a free-text contact field into structured
-- identity. This is the foundation for WhatsApp delivery AND for future
-- mobile-payment rails (Swish, M-Pesa, MoMo, Stripe-by-phone) — every
-- downstream payment integration keys off a verified E.164 number plus the
-- detected country/carrier.
--
-- Strategy: ADD new structured columns next to the existing free-text
-- `phone` / `mobile_number`. Old columns remain authoritative until
-- backfill normalises them; nothing breaks today. Lazy backfill happens
-- as users hit the new verification flow.
--
-- Idempotent: safe to re-run.

-- 1. people (CRM contacts: guests, leads, etc.) ------------------------
ALTER TABLE people ADD COLUMN IF NOT EXISTS phone_e164                 TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS phone_country              TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS phone_carrier              TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS phone_verified_at          TIMESTAMPTZ;
ALTER TABLE people ADD COLUMN IF NOT EXISTS phone_verification_source  TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS whatsapp_capable_at        TIMESTAMPTZ;

-- E.164 normalisation guard. Allow NULL; otherwise must start with `+`
-- followed by digits. We keep raw freeform `phone` un-constrained so old
-- imports don't fail.
ALTER TABLE people
  DROP CONSTRAINT IF EXISTS people_phone_e164_format;
ALTER TABLE people
  ADD  CONSTRAINT people_phone_e164_format
  CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$');

-- ISO-3166-1 alpha-2 country (e.g. 'SE', 'KE'). Case-checked uppercase.
ALTER TABLE people
  DROP CONSTRAINT IF EXISTS people_phone_country_iso2;
ALTER TABLE people
  ADD  CONSTRAINT people_phone_country_iso2
  CHECK (phone_country IS NULL OR phone_country ~ '^[A-Z]{2}$');

CREATE INDEX IF NOT EXISTS idx_people_phone_e164
  ON people (phone_e164)
  WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_phone_country
  ON people (phone_country)
  WHERE phone_country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_phone_verified
  ON people (phone_verified_at)
  WHERE phone_verified_at IS NOT NULL;

-- 2. profiles (account-holders: hosts) ---------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_e164                 TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_country              TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_carrier              TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified_at          TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verification_source  TEXT;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_e164_format;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_phone_e164_format
  CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_country_iso2;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_phone_country_iso2
  CHECK (phone_country IS NULL OR phone_country ~ '^[A-Z]{2}$');

CREATE INDEX IF NOT EXISTS idx_profiles_phone_e164
  ON profiles (phone_e164)
  WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_phone_verified
  ON profiles (phone_verified_at)
  WHERE phone_verified_at IS NOT NULL;

COMMENT ON COLUMN people.phone_e164 IS
  'E.164-normalised phone (+CC...). Authoritative once present; the freeform `phone` column is legacy.';
COMMENT ON COLUMN profiles.phone_e164 IS
  'E.164-normalised phone (+CC...). Authoritative once present; the freeform `mobile_number` column is legacy.';
COMMENT ON COLUMN people.phone_verified_at IS
  'When the human proved ownership of phone_e164 via the magic-link flow. Required for payment rails.';
COMMENT ON COLUMN profiles.phone_verified_at IS
  'When the host proved ownership of phone_e164 via the magic-link flow. Required for payment rails.';
