-- 163: limits the owner sets on one organiser account, from /admin/platform
-- (routes/adminPlatform.js, lib/accountLimits.js). No row = no limits.
--   mail_blocked     no mail goes out for the account: no sends, and sign-ups
--                    to its events are saved but get no confirmation mail
--   publish_blocked  the account can't publish events (drafts still work)
--   max_events       at most this many events (null = no cap)
-- Logging in is stopped with Supabase's own ban, not here.
CREATE TABLE IF NOT EXISTS account_limits (
  host_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mail_blocked boolean NOT NULL DEFAULT false,
  publish_blocked boolean NOT NULL DEFAULT false,
  max_events integer CHECK (max_events IS NULL OR max_events >= 0),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_limits FROM anon, authenticated, PUBLIC;
