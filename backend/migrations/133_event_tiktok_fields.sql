-- 133_event_tiktok_fields.sql
-- Per-event "ask the guest for their TikTok handle" toggle, mirroring the
-- Instagram collect/require pair (migs 061 + 063). TikTok is an UNVERIFIED soft
-- claim only — there is no TikTok login/OAuth — so this is purely a form toggle
-- feeding people.tiktok (added in mig 019) and the person_identities `tiktok`
-- kind (enum already includes it, mig 048).
--
-- Unlike Instagram (collect_instagram DEFAULT true), TikTok defaults OFF: it is a
-- new field and should not silently appear on every existing event's RSVP form.
-- Hosts opt in via the same Off / Optional / Required toggle.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS collect_tiktok BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_tiktok BOOLEAN NOT NULL DEFAULT false;
