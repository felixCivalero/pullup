-- 146_project_docs.sql
-- A project (one per client) has a timeline (planner_*, 145), a free-form
-- board for developing formats and gathering references, and a strategy deck
-- (vision, goals, audience…). Board and deck are each one JSON doc here,
-- saved with a version guard: a write with a stale version gets the latest.
--   board:    { items: [{ id, type: text|sticky|todo|embed|media|frame, x, y, w, h, … }] }
--   strategy: { slides: [{ id, title, body, image }] }
-- A board frame is a content format: its title is the format cards carry on
-- the timeline (planner_cards.meta.format).
CREATE TABLE IF NOT EXISTS project_docs (
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('board', 'strategy')),
  doc        JSONB NOT NULL DEFAULT '{}'::jsonb,
  version    INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, kind)
);

-- Service role only (the admin API).
ALTER TABLE project_docs ENABLE ROW LEVEL SECURITY;
