-- Lightweight telemetry for MCP tool invocations.
--
-- Lets us debug "Adam said the MCP isn't working" without grepping stderr.
-- One row per tool call: who, which tool, ok/error, how long, a short error
-- excerpt for failures. We deliberately do NOT store arguments or results
-- — the schema is forensic, not analytical, and avoids PII leakage into a
-- table that's easier to query than the structured event tables.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token_id       UUID REFERENCES personal_access_tokens(id) ON DELETE SET NULL,
  tool_name      TEXT NOT NULL,
  ok             BOOLEAN NOT NULL,
  duration_ms    INTEGER NOT NULL,
  error_excerpt  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_user_recent
  ON mcp_tool_calls(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_failures
  ON mcp_tool_calls(created_at DESC) WHERE ok = false;

ALTER TABLE mcp_tool_calls ENABLE ROW LEVEL SECURITY;
