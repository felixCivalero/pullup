-- Personal Access Tokens for programmatic/MCP access to PullUp.
--
-- Tokens are long-lived credentials minted from a logged-in session and
-- used as bearer tokens by clients that can't run a browser-based Supabase
-- auth flow (CLI, MCP servers, automation). Plaintext is shown to the user
-- exactly once at mint time; only the SHA-256 hash is persisted.
--
-- Plaintext format: `pup_<48 base64url chars>` so requireAuth can
-- distinguish PATs from Supabase JWTs by prefix and route accordingly.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pat_user_id    ON personal_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_pat_token_hash ON personal_access_tokens(token_hash);

-- RLS on. Backend uses service_role and bypasses policies; no client-side
-- access is expected. Enabling RLS without policies is the secure default
-- for a "backend-only" table.
ALTER TABLE personal_access_tokens ENABLE ROW LEVEL SECURITY;
