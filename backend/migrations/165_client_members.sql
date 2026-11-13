-- 165: people outside PullUp who work in one client's project (Projekt:
-- pitch, strategy, board, timeline). Keyed by email so access is ready
-- before they have an account; they sign in like any organiser. Service role
-- only (no grants to anon/authenticated, see mig 149).
CREATE TABLE IF NOT EXISTS client_members (
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email) AND position('@' in email) > 1),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, email)
);
CREATE INDEX IF NOT EXISTS client_members_email_idx ON client_members (email);
REVOKE ALL ON client_members FROM anon, authenticated;
