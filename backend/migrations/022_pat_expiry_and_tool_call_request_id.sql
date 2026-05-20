-- Two small schema additions tied to the MCP hardening pass:
--
-- 1. personal_access_tokens.expires_at — optional expiry for PATs. Manual
--    tokens default NULL (perpetual). OAuth-issued tokens get an expiry
--    set at mint time (currently still NULL until the OAuth flow opts in).
--    findPatRecord rejects expired tokens at lookup.
--
-- 2. mcp_tool_calls.request_id — correlation id for all tool calls made
--    inside one /mcp JSON-RPC request. Lets us group "Adam's session at
--    14:32" into a single forensic trace when debugging.
--
-- Idempotent: safe to re-run.

ALTER TABLE personal_access_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pat_expires_at
  ON personal_access_tokens(expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE mcp_tool_calls
  ADD COLUMN IF NOT EXISTS request_id UUID;

CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_request
  ON mcp_tool_calls(request_id)
  WHERE request_id IS NOT NULL;
