-- 056_instagram_threads.sql
-- IG live-chat threads — mirror of whatsapp_threads, keyed by the guest's IGSID
-- instead of a phone. Same 24h conversation-window semantics: Meta allows
-- free-text IG DMs only inside the 24h window opened by an inbound message
-- (there is no IG message-template path). Applied to prod via MCP 2026-06-03.
CREATE TABLE IF NOT EXISTS instagram_threads (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                       UUID        NOT NULL REFERENCES people(id)   ON DELETE CASCADE,
  host_profile_id                 UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ig_user_id                      TEXT        NOT NULL,
  last_message_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview            TEXT,
  last_message_direction          TEXT        CHECK (last_message_direction IN ('outbound','inbound')),
  unread_count                    INT         NOT NULL DEFAULT 0,
  conversation_window_opens_at    TIMESTAMPTZ,
  conversation_window_expires_at  TIMESTAMPTZ,
  pinned                          BOOLEAN     NOT NULL DEFAULT FALSE,
  archived_at                     TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (person_id, host_profile_id)
);
CREATE INDEX IF NOT EXISTS idx_instagram_threads_host_recent
  ON instagram_threads (host_profile_id, last_message_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_threads_iguser ON instagram_threads (ig_user_id);
