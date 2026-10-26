-- 148_agents_and_device_login.sql
-- An AI and a person are the same user on PullUp: whatever someone can do on
-- the site, their own assistant can do for them. Three pieces:
--
-- 1. login_attempts — sign-in by mail, bound to the browser that asked. The
--    browser keeps a secret (never sent in the mail); the code and the link
--    only work together with it, so a forwarded link or code is useless
--    anywhere else. lib/deviceLogin.js, routes/auth.js.
-- 2. agent_clients / agent_auth_requests / agent_auth_codes / agent_grants —
--    OAuth 2.1 for remote MCP clients (Claude, ChatGPT, …): an assistant
--    registers itself (RFC 7591), the person approves it once on
--    pullup.se/connect, the assistant gets a short-lived access token and a
--    rotating refresh token. Tokens are stored as SHA-256 hashes only. A
--    refresh token used twice revokes the whole grant (it was stolen).
--    agents/oauthProvider.js, routes/oauth.js.
-- 3. agent_calls — every action an assistant runs (remote MCP or WebMCP in
--    the browser): who, which door, which action, ok or not, how long.
--
-- Service role only (RLS on, no policies). The old app's oauth_clients /
-- oauth_authorization_codes / personal_access_tokens / mcp_tool_calls stay
-- untouched (branch pullup-app); nothing here reads them.

CREATE TABLE IF NOT EXISTS login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  device_hash  TEXT NOT NULL,          -- sha256 of the browser's secret
  code_hash    TEXT NOT NULL,          -- sha256 of the six digits in the mail
  link_hash    TEXT NOT NULL,          -- sha256 of the link's secret
  token_hash   TEXT NOT NULL,          -- Supabase's one-time token, redeemed server side
  tries        INTEGER NOT NULL DEFAULT 0,
  device       TEXT,                   -- "Chrome på macOS", shown in the mail
  country      TEXT,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, created_at DESC);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- A registered assistant (RFC 7591 client metadata as sent, plus what we issued).
CREATE TABLE IF NOT EXISTS agent_clients (
  client_id    TEXT PRIMARY KEY,
  metadata     JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
ALTER TABLE agent_clients ENABLE ROW LEVEL SECURITY;

-- An authorization waiting for the person to approve it on /connect.
CREATE TABLE IF NOT EXISTS agent_auth_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      TEXT NOT NULL REFERENCES agent_clients(client_id) ON DELETE CASCADE,
  redirect_uri   TEXT NOT NULL,
  state          TEXT,
  code_challenge TEXT NOT NULL,
  scopes         TEXT[] NOT NULL DEFAULT '{}',
  resource       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  decided_at     TIMESTAMPTZ
);
ALTER TABLE agent_auth_requests ENABLE ROW LEVEL SECURITY;

-- An authorization code: one use, a few minutes, PKCE-bound.
CREATE TABLE IF NOT EXISTS agent_auth_codes (
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL REFERENCES agent_clients(client_id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scopes         TEXT[] NOT NULL DEFAULT '{}',
  resource       TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ
);
ALTER TABLE agent_auth_codes ENABLE ROW LEVEL SECURITY;

-- One row per approved assistant per person. The tokens rotate in place.
CREATE TABLE IF NOT EXISTS agent_grants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             TEXT NOT NULL REFERENCES agent_clients(client_id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes                TEXT[] NOT NULL DEFAULT '{}',
  resource              TEXT,
  access_hash           TEXT NOT NULL UNIQUE,
  access_expires_at     TIMESTAMPTZ NOT NULL,
  refresh_hash          TEXT UNIQUE,
  previous_refresh_hash TEXT,
  refresh_expires_at    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at          TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS agent_grants_user_idx ON agent_grants (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_grants_prev_refresh_idx ON agent_grants (previous_refresh_hash) WHERE previous_refresh_hash IS NOT NULL;
ALTER TABLE agent_grants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS agent_calls (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id    UUID,
  client_id  TEXT,
  door       TEXT NOT NULL CHECK (door IN ('mcp', 'webmcp', 'http')),
  action     TEXT NOT NULL,
  ok         BOOLEAN NOT NULL,
  ms         INTEGER,
  error      TEXT
);
CREATE INDEX IF NOT EXISTS agent_calls_user_idx ON agent_calls (user_id, at DESC);
ALTER TABLE agent_calls ENABLE ROW LEVEL SECURITY;

-- Sends to a list now belong to a host (each organiser sees their own).
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS host_id UUID;
CREATE INDEX IF NOT EXISTS email_outbox_host_idx ON email_outbox (host_id, created_at DESC) WHERE host_id IS NOT NULL;

-- Spent and stale rows go away by themselves.
SELECT cron.schedule('agent-auth-cleanup', '17 3 * * *', $$
  DELETE FROM login_attempts WHERE expires_at < NOW() - INTERVAL '30 days';
  DELETE FROM agent_auth_requests WHERE expires_at < NOW() - INTERVAL '1 day';
  DELETE FROM agent_auth_codes WHERE expires_at < NOW() - INTERVAL '1 day';
  DELETE FROM agent_calls WHERE at < NOW() - INTERVAL '180 days';
$$);
