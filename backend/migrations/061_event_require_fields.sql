-- 061_event_require_fields.sql
-- Per-field required toggles for the (now fixed) RSVP form. The form always
-- shows Name, Email, WhatsApp, Instagram. Name + Email are always required;
-- WhatsApp and Instagram are required only if the host opts in. This replaces
-- contact_channel as the form driver (contact_channel is NOT used by comms
-- routing — dispatch routes per-person on verified phone + opt-in — so it's
-- kept only for backwards-compat and ignored by the new form).
-- WhatsApp-native (making WhatsApp required *instead* of email) is deferred
-- until the email flow is proven, so there is no require_email toggle yet.
-- Applied to prod via MCP 2026-06-06.
ALTER TABLE events ADD COLUMN IF NOT EXISTS require_phone BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS require_instagram BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN events.require_phone IS
  'RSVP form: require the WhatsApp number (else optional). Name + Email are always required.';
COMMENT ON COLUMN events.require_instagram IS
  'RSVP form: require the Instagram handle (else optional).';
