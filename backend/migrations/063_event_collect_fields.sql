-- 063_event_collect_fields.sql
-- Whether the RSVP form collects WhatsApp / Instagram at all. Combined with
-- require_phone / require_instagram (migration 061) this gives each of those two
-- fields a 3-state control in the event editor: Off (not collected) / Optional
-- (collected, not required) / Required (collected + required). Name + Email are
-- always collected and required. Default true so existing events keep showing
-- both fields (matches current behaviour).
-- Applied to prod via MCP 2026-06-06.
ALTER TABLE events ADD COLUMN IF NOT EXISTS collect_phone BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS collect_instagram BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN events.collect_phone IS
  'RSVP form: collect the WhatsApp number at all (Off when false). With require_phone gives Off/Optional/Required.';
COMMENT ON COLUMN events.collect_instagram IS
  'RSVP form: collect the Instagram handle at all (Off when false). With require_instagram gives Off/Optional/Required.';
