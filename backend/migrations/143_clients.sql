-- 143_clients.sql
-- Clients: the people Felix is actually working with. The sales pipeline
-- lives in the Google Sheet (PullUp_prospects); a prospect becomes a client
-- here once it reaches a meeting (or Felix pulls it in by hand). The sheet
-- keeps owning the stage; this table owns the work: meeting time and prep.
-- prospect_id is the sheet's ID (P-123), the only link between the two.
--
-- agency_requests.prospect_id records which sheet row a website request
-- became.

CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  TEXT NOT NULL UNIQUE,
  company      TEXT NOT NULL,
  person       TEXT,
  email        TEXT,
  meeting_at   TIMESTAMPTZ,
  prep         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_meeting ON clients(meeting_at);

-- Service role only (the admin API); no client-side access.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE agency_requests ADD COLUMN IF NOT EXISTS prospect_id TEXT;
