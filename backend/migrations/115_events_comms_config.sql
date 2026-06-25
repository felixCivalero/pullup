-- Per-event communication control (the editor's "Communication" rail panel).
-- One jsonb blob holding the host's settings for the three automatic sends:
--   signup    — immediate confirmation / welcome
--   reminder  — before the event (default ~12h)
--   postEvent — after the event ("thanks, upload your photos")
--
-- Shape + defaults + clamping are owned by src/services/eventComms.js
-- (normalizeCommsConfig). NULL means "use defaults" — so existing events keep
-- the standard arc with no backfill.
alter table public.events
  add column if not exists comms_config jsonb;

comment on column public.events.comms_config is
  'Per-event automatic-message config (signup/reminder/postEvent). Shape: src/services/eventComms.js normalizeCommsConfig. NULL = defaults.';
