-- 041_whatsapp_threads.sql
-- Per-(contact, host) conversation header for the live-thread CRM view.
-- One row per relationship; the actual messages live in whatsapp_outbox
-- (both directions). This table is the index the inbox UI scans:
-- "show me my threads sorted by last activity, with unread badges."
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS whatsapp_threads (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                       UUID        NOT NULL REFERENCES people(id)   ON DELETE CASCADE,
  host_profile_id                 UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone_e164                      TEXT        NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),

  last_message_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview            TEXT,
  last_message_direction          TEXT        CHECK (last_message_direction IN ('outbound','inbound')),
  last_outbox_id                  UUID        REFERENCES whatsapp_outbox(id) ON DELETE SET NULL,

  unread_count                    INT         NOT NULL DEFAULT 0,
  conversation_window_opens_at    TIMESTAMPTZ,  -- when the 24h freeform window started (NULL = closed)
  conversation_window_expires_at  TIMESTAMPTZ,  -- opens_at + 24h, denormalised for query speed

  pinned                          BOOLEAN     NOT NULL DEFAULT FALSE,
  archived_at                     TIMESTAMPTZ,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (person_id, host_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_threads_host_recent
  ON whatsapp_threads (host_profile_id, last_message_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_threads_host_unread
  ON whatsapp_threads (host_profile_id, unread_count)
  WHERE unread_count > 0 AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_threads_phone
  ON whatsapp_threads (phone_e164);

DROP TRIGGER IF EXISTS trg_whatsapp_threads_updated_at ON whatsapp_threads;
CREATE TRIGGER trg_whatsapp_threads_updated_at
  BEFORE UPDATE ON whatsapp_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_updated_at();

ALTER TABLE whatsapp_threads ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE whatsapp_threads IS
  'Conversation header per (contact, host). Index for the live-thread inbox UI; actual messages live in whatsapp_outbox.';
COMMENT ON COLUMN whatsapp_threads.conversation_window_opens_at IS
  'When the Meta 24h freeform window opened on this thread. NULL = closed (next outbound must be a template).';
