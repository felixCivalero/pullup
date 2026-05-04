-- 014_profile_city.sql
-- Add `city` to profiles so onboarding can capture where the host is based.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS city text;
