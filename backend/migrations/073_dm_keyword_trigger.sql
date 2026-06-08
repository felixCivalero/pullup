-- 073_dm_keyword_trigger.sql
--
-- The second Instagram keyword surface: DMs (which includes STORY REPLIES —
-- Instagram delivers a story reply as a direct message, not a comment). Adds:
--
--   trigger_type = 'dm_keyword' — someone DMs the account a keyword (or replies
--   to a story with it) → PullUp auto-DMs the event link. No media scope (a DM
--   isn't tied to a post). The reply ships in the SAME 24h window the inbound
--   message just opened, so it's a plain free-text DM (no template needed).
--
-- Plus an idempotency claim table mirroring ig_comment_triggers: Meta retries
-- webhook delivery, so we claim each inbound message id BEFORE replying and
-- treat a duplicate as already-handled — a redelivery can never double-DM.

BEGIN;

-- Allow the new trigger type alongside comment + rsvp_success.
ALTER TABLE event_comment_triggers
  DROP CONSTRAINT IF EXISTS event_comment_triggers_trigger_type_check;
ALTER TABLE event_comment_triggers
  ADD CONSTRAINT event_comment_triggers_trigger_type_check
  CHECK (trigger_type IN ('comment', 'rsvp_success', 'dm_keyword'));

-- One auto-reply per inbound DM, ever. UNIQUE(host, inbound_mid) is the claim:
-- insert first, and a unique-violation on redelivery means "already handled".
CREATE TABLE IF NOT EXISTS ig_dm_triggers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inbound_mid       TEXT NOT NULL,
  trigger_id        UUID REFERENCES event_comment_triggers(id) ON DELETE SET NULL,
  person_id         UUID,
  matched_keyword   TEXT,
  reply_message_id  TEXT,
  status            TEXT NOT NULL DEFAULT 'sent',  -- 'sent' | 'error'
  detail            JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (host_profile_id, inbound_mid)
);

CREATE INDEX IF NOT EXISTS idx_ig_dm_triggers_host ON ig_dm_triggers (host_profile_id);

-- Service-role only, like the rest of the IG tables.
ALTER TABLE ig_dm_triggers ENABLE ROW LEVEL SECURITY;

COMMIT;
