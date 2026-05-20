-- OAuth 2.1 for PullUp MCP.
--
-- Two new tables:
--   oauth_clients              — registered AI apps (claude.ai, ChatGPT, etc.).
--                                Created via RFC 7591 Dynamic Client Registration;
--                                each client is identified by an opaque client_id.
--   oauth_authorization_codes  — short-lived (60s) codes issued at /oauth/authorize
--                                and redeemed at /oauth/token. PKCE-required.
--
-- Issued access tokens are NOT stored here — we reuse the existing
-- personal_access_tokens table so all MCP auth (manual PATs + OAuth-issued
-- tokens) flow through one validation path. OAuth tokens get a name like
-- "OAuth: claude.ai (via DCR)" so users can spot them in Settings.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS oauth_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT NOT NULL UNIQUE,           -- public identifier sent to MCP clients
  client_name     TEXT,                            -- self-reported name from DCR
  redirect_uris   JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of allowed redirect URIs
  -- For public clients (PKCE-only) there is NO client_secret. We only support
  -- public clients; secret-based auth is out of scope for the MCP use case.
  is_dynamic      BOOLEAN NOT NULL DEFAULT TRUE,   -- was this created via DCR?
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id ON oauth_clients(client_id);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code                    TEXT PRIMARY KEY,        -- random opaque code
  client_id               TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri            TEXT NOT NULL,           -- must match the registered URI exactly at redeem
  scope                   TEXT,                    -- requested scope (we only support "mcp")
  code_challenge          TEXT NOT NULL,           -- PKCE: SHA256(verifier) base64url-encoded
  code_challenge_method   TEXT NOT NULL DEFAULT 'S256',
  expires_at              TIMESTAMPTZ NOT NULL,    -- typically NOW() + 60s
  used_at                 TIMESTAMPTZ,             -- single-use: set on redeem
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_user_id ON oauth_authorization_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires_at ON oauth_authorization_codes(expires_at);

-- RLS on. Backend uses service_role and bypasses policies; no client-side
-- access is expected. Enabling RLS without policies is the secure default
-- for backend-only tables.
ALTER TABLE oauth_clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_authorization_codes  ENABLE ROW LEVEL SECURITY;
