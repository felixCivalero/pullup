-- 078_people_email_unique.sql
--
-- One person per email (case-insensitive). The DB backstop for findOrCreatePerson,
-- whose app-level .single() dedup was race-prone (threw on a duplicate, and a
-- concurrent RSVP could fork a second row). Partial: IG/phone-only people may have
-- no email and must stay allowed. 0 duplicate-email groups at apply time.
--
-- APPLIED TO PROD 2026-06-09. Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_people_email_lower
  ON people (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';
