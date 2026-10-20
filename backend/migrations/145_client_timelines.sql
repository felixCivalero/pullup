-- 145_client_timelines.sql
-- A client is someone Felix works for (sheet Stage = Won). Meeting notes live
-- in one Google Doc per client (doc_url); meeting time and prep moved to that
-- doc and the sheet, so they go from here.
-- The content timeline (Tidslinje) is per client: every card, lane and event
-- mark belongs to one. Rows from before this have no client.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS doc_url TEXT;
ALTER TABLE clients DROP COLUMN IF EXISTS meeting_at;
ALTER TABLE clients DROP COLUMN IF EXISTS prep;

ALTER TABLE planner_cards ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE planner_timelines ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE planner_events ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_planner_cards_client ON planner_cards(host_id, client_id);
CREATE INDEX IF NOT EXISTS idx_planner_timelines_client ON planner_timelines(host_id, client_id);
CREATE INDEX IF NOT EXISTS idx_planner_events_client ON planner_events(host_id, client_id);
