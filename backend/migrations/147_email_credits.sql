-- 147_email_credits.sql
-- Marketing mail is paid, always: a host buys a pack of sends (Stripe
-- Checkout) and every mail to their list takes one. Mail a guest triggers
-- themselves (confirmation, reminder) is free and never touches this.
--
-- A ledger, one row per movement; the balance is the sum.
--   purchase  +N  a paid Checkout session (stripe_session_id: credited once)
--   send      -N  reserved before a send starts (campaign_tag)
--   refund    +N  mails of that send the provider refused
--   adjust    ±N  by hand, with a note
CREATE TABLE IF NOT EXISTS email_credit_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id           UUID NOT NULL,
  delta             INTEGER NOT NULL,
  reason            TEXT NOT NULL CHECK (reason IN ('purchase', 'send', 'refund', 'adjust')),
  pack              TEXT,
  amount_sek        NUMERIC(10, 2),
  stripe_session_id TEXT UNIQUE,
  campaign_tag      TEXT,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_credit_ledger_host_idx ON email_credit_ledger (host_id, created_at DESC);

CREATE OR REPLACE FUNCTION email_credit_balance(p_host UUID) RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(delta), 0)::INTEGER FROM email_credit_ledger WHERE host_id = p_host;
$$;

-- Take p_count sends from the host's balance, or nothing. Returns the balance
-- left, or NULL when it doesn't cover the send. A per-host lock makes two
-- sends at once queue up instead of both spending the same credits.
CREATE OR REPLACE FUNCTION reserve_email_credits(p_host UUID, p_count INTEGER, p_tag TEXT) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE bal INTEGER;
BEGIN
  IF p_count <= 0 THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('email_credits:' || p_host::text));
  SELECT COALESCE(SUM(delta), 0) INTO bal FROM email_credit_ledger WHERE host_id = p_host;
  IF bal < p_count THEN RETURN NULL; END IF;
  INSERT INTO email_credit_ledger (host_id, delta, reason, campaign_tag) VALUES (p_host, -p_count, 'send', p_tag);
  RETURN bal - p_count;
END;
$$;

-- Service role only (the API).
ALTER TABLE email_credit_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION email_credit_balance(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reserve_email_credits(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
