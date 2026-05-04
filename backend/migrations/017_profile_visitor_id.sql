-- 017_profile_visitor_id.sql
-- Captures the visitor_id (the localStorage id we use to key landing
-- page views/events) on the user's profile. With this, the admin CRM
-- can show pre-signup engagement signals per person — total landing
-- page visits, first visit date, etc — to spot patterns like "they
-- usually need N visits before clicking the CTA". Index supports the
-- IN-list lookup the CRM endpoint uses.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS visitor_id text;

CREATE INDEX IF NOT EXISTS profiles_visitor_id_idx
  ON profiles (visitor_id);
