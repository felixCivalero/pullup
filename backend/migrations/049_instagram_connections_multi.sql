-- 049_instagram_connections_multi.sql
-- Multi-account Instagram per host (e.g. Personal + Business), with a chosen
-- default "reply from" account.
--
-- Purely ADDITIVE + idempotent. The table already permitted multiple rows per
-- host (the unique index is on ig_user_id; the host index is non-unique), so
-- connecting a second account already worked at the data layer — this only adds
-- a host-set label and a default-sender selection. Nothing existing changes.

ALTER TABLE instagram_connections ADD COLUMN IF NOT EXISTS label      TEXT;
ALTER TABLE instagram_connections ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- At most one default account per host (the account new replies send from).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ig_conn_default_per_host
  ON instagram_connections (host_profile_id)
  WHERE is_default;

COMMENT ON COLUMN instagram_connections.label IS
  'Host-set label for this account, e.g. "Personal" / "Business". Display only.';
COMMENT ON COLUMN instagram_connections.is_default IS
  'The account new replies send from by default. At most one true per host (partial unique index above).';
