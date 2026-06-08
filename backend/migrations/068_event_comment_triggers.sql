-- 068_event_comment_triggers.sql
--
-- Per-event Instagram comment→DM triggers. Replaces the old global model
-- (instagram_connections.comment_rules jsonb) with first-class rows anchored
-- to a specific event, so:
--   • "which event" is never a typed slug — it IS the event_id (FK).
--   • a trigger is "LIVE" only while its event hasn't ended; expiry is computed
--     at match time as COALESCE(events.ends_at, events.starts_at) > now(), so a
--     finished event's trigger simply goes silent with no cron required.
--   • keyword uniqueness only needs to hold among LIVE triggers, which means a
--     keyword (e.g. GUESTLIST) frees itself up for the next event automatically.
--
-- The link the DM carries is built from the event's CURRENT slug at fire-time
-- (resolved via the FK), so renaming the event never breaks the automation.
--
-- ADDITIVE: no data to migrate (the global model shipped with zero rules).

BEGIN;

CREATE TABLE IF NOT EXISTS event_comment_triggers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  host_profile_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword          TEXT NOT NULL,
  match_type       TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains','exact')),
  reply_text       TEXT,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  media_id         TEXT,                 -- optional: scope to one post (NULL = whole account)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comment fan-out: a comment resolves to a host, then we pull that host's
-- live triggers. host_profile_id is the hot path; event_id supports the
-- per-event listing + cascade.
CREATE INDEX IF NOT EXISTS idx_ect_host  ON event_comment_triggers (host_profile_id);
CREATE INDEX IF NOT EXISTS idx_ect_event ON event_comment_triggers (event_id);

-- Backend touches this table exclusively via the service-role key, so RLS-on
-- with no client policy = deny to anon/authenticated, allow service role.
ALTER TABLE event_comment_triggers ENABLE ROW LEVEL SECURITY;

COMMIT;
