-- 058_two_way_email.sql
-- Two-way email: a guest replies to a host email from their inbox, the reply
-- lands in the host's Room thread, and host replies go back to the inbox.
--
-- Outbound emails carry Reply-To: reply+<tracking_id>@<inbound-domain>. To map
-- an inbound reply back to a (person, host) thread we need the outbox row to
-- remember who/whose it was — today it only stores to_email + tracking_id.

ALTER TABLE email_outbox
  ADD COLUMN IF NOT EXISTS person_id       UUID REFERENCES people(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS host_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Inbound resolves the reply token (= tracking_id) back to its outbox row.
CREATE INDEX IF NOT EXISTS email_outbox_tracking_id_idx
  ON email_outbox (tracking_id);

-- Raw inbound replies. Mostly an audit/debug record + idempotency guard: SNS
-- can redeliver the same SES message, and ses_message_id is unique so a repeat
-- is a no-op. The host-visible copy of the message lives in person_events
-- (type='message_in', channel='email'); this table keeps the untrimmed body.
CREATE TABLE IF NOT EXISTS email_inbound (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ses_message_id   TEXT UNIQUE,
  person_id        UUID REFERENCES people(id)   ON DELETE SET NULL,
  host_profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  outbox_id        UUID REFERENCES email_outbox(id) ON DELETE SET NULL,
  token            TEXT,
  from_email       TEXT,
  to_address       TEXT,
  subject          TEXT,
  body_text        TEXT,          -- the new reply text the host sees (quotes stripped)
  raw_body         TEXT,          -- full decoded text part, nothing lost
  status           TEXT NOT NULL DEFAULT 'threaded',  -- threaded | unmatched | ignored
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_inbound_person_idx ON email_inbound (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_inbound_host_idx   ON email_inbound (host_profile_id, created_at DESC);
