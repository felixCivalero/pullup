-- 069_require_email_toggle.sql
--
-- Reach-floor model: a host must require at least one of Email / WhatsApp so
-- every guest is reachable. Email used to be hard-coded "always required"; it
-- now becomes a real toggle (Required / Optional) alongside WhatsApp.
--
-- Backward-compatible: existing events keep email required (default true), so
-- nothing changes for anything already live.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS require_email boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN events.require_email IS
  'Whether the guest must provide an email at RSVP. At least one of require_email / require_phone must be true (the reach floor). Default true.';
