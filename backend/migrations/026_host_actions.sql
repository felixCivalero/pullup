-- host_actions: every mutating action a host takes, in MCP-tool shape.
--
-- Different from mcp_tool_calls (forensic, no args, telemetry-only). This is
-- analytical / product: "what did the host do this week?", "replay this
-- intent for next week's event", coaching that fires on UI moves the same
-- way it fires on chat moves.
--
-- One row per mutation. tool + args mirror the MCP tool surface so anything
-- in here is in principle replayable through MCP. source distinguishes who
-- did it (web UI vs the connected chat client). target_type + target_id make
-- per-resource queries cheap ("show me everything we did to event X").

CREATE TABLE IF NOT EXISTS host_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool           TEXT NOT NULL,
  args           JSONB NOT NULL DEFAULT '{}'::jsonb,
  source         TEXT NOT NULL CHECK (source IN ('ui', 'chat', 'sdk', 'system')),
  target_type    TEXT,
  target_id      TEXT,
  result         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_host_actions_host_recent
  ON host_actions(host_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_host_actions_target
  ON host_actions(host_id, target_type, target_id, created_at DESC);

ALTER TABLE host_actions ENABLE ROW LEVEL SECURITY;

-- Read-your-own-actions policy. Writes only via service role (backend
-- emitIntent), so no insert policy needed for authenticated users.
DROP POLICY IF EXISTS "host_actions_select_own" ON host_actions;
CREATE POLICY "host_actions_select_own" ON host_actions
  FOR SELECT
  USING (auth.uid() = host_id);
