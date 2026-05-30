-- 046_ig_comment_triggers.sql
-- The comment→DM automation: per-host keyword rules + an idempotency log.
-- Additive only. Idempotent: safe to re-run.
--
--   instagram_connections.comment_rules (jsonb) — the host's rules. Each:
--     { "id": "...", "keyword": "guestlist", "match": "contains"|"exact",
--       "media_id": null,          -- null = any post; else only that media
--       "event_slug": "summer-jam",-- where the signup link points
--       "reply_text": "You're in — tap to grab your spot 👇",
--       "enabled": true }
--
--   ig_comment_triggers — one row per comment we've replied to. The UNIQUE
--   on comment_id enforces Meta's "one private reply per comment" AND makes
--   webhook redelivery idempotent (Meta retries; we must not double-DM).

ALTER TABLE instagram_connections
  ADD COLUMN IF NOT EXISTS comment_rules JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN instagram_connections.comment_rules IS
  'Per-host comment→DM keyword rules. Array of {keyword,match,media_id,event_slug,reply_text,enabled}.';

CREATE TABLE IF NOT EXISTS ig_comment_triggers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id     UUID REFERENCES profiles (id) ON DELETE SET NULL,
  ig_user_id          TEXT NOT NULL,          -- the host's connected IG account
  comment_id          TEXT NOT NULL,          -- the comment we replied to
  media_id            TEXT,
  commenter_ig_id     TEXT,                    -- IGSID of the person who commented
  commenter_username  TEXT,
  matched_keyword     TEXT,
  reply_message_id    TEXT,                    -- provider message id of our DM
  signup_link         TEXT,
  status              TEXT NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent', 'skipped', 'error')),
  detail              JSONB,                   -- error / skip reason
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One reply per comment — the idempotency guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ig_comment_triggers_comment
  ON ig_comment_triggers (comment_id);
CREATE INDEX IF NOT EXISTS idx_ig_comment_triggers_host
  ON ig_comment_triggers (host_profile_id);
CREATE INDEX IF NOT EXISTS idx_ig_comment_triggers_commenter
  ON ig_comment_triggers (commenter_ig_id)
  WHERE commenter_ig_id IS NOT NULL;

COMMENT ON TABLE ig_comment_triggers IS
  'Log of comment→DM fires. UNIQUE(comment_id) enforces one private reply per comment + idempotent webhook redelivery.';
