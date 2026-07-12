-- 134_rsvp_age_confirmed.sql
-- GDPR age-of-consent: the RSVP form makes every guest attest they are 18 or
-- older (folded into the already-required terms/privacy checkbox that gates
-- submit). We log the attestation as a timestamped consent for traceability,
-- the same shape as other consent signals. 18 is chosen deliberately to sit
-- above every EU national digital-consent age (13–16), so no per-country logic
-- and no parental-consent flow is ever needed.

ALTER TABLE rsvps
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
