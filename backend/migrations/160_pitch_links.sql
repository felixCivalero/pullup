-- 160: share links for pitches. A pitch (frontend pitch/<slug>.jsx) can be
-- opened without signing in at pullup.se/s/<token>, but only by someone who
-- has the token, and only until it expires or Felix closes it. Service role
-- only (lockdown rule, mig 149): the public read goes through the API.
CREATE TABLE IF NOT EXISTS pitch_links (
  token          TEXT PRIMARY KEY,
  slug           TEXT NOT NULL,
  prospect_id    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  views          INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pitch_links_slug_idx ON pitch_links (slug, created_at DESC);
ALTER TABLE pitch_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pitch_links FROM anon, authenticated;
