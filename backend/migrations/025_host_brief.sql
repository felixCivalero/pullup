-- 025_host_brief.sql
-- A freeform "creator brief" the host writes once and the MCP-connected AI
-- reads on every conversation open. Used to calibrate event-creation
-- suggestions to who the host is, what kind of events they run, and where
-- they want to take it. Surfaced through get_host_brief / set_host_brief
-- and via the McpServer's top-level `instructions` so the AI sees it as
-- system-level context.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS host_brief text;
