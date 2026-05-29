-- 038_phone_opt_ins.sql
-- Auditable opt-in records for messaging a phone number. WhatsApp Business
-- policy requires explicit opt-in per channel; GDPR requires a record of
-- consent (when, where, by whom, on what basis). One row per
-- (phone, channel, host) opt-in event. Opt-outs are recorded as
-- `opted_out_at` on the same row rather than deletes — we need the
-- history for audits and for re-opt-in detection.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS phone_opt_ins (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164      TEXT        NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  person_id       UUID        REFERENCES people(id)   ON DELETE SET NULL,
  profile_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  channel         TEXT        NOT NULL CHECK (channel IN ('whatsapp','sms')),
  source          TEXT        NOT NULL,
  host_profile_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  legal_basis     TEXT,
  opted_in_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opted_out_at    TIMESTAMPTZ,
  opted_out_reason TEXT,
  ip_address      TEXT,
  user_agent      TEXT,
  gdpr_payload    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_opt_ins_phone_channel
  ON phone_opt_ins (phone_e164, channel);
CREATE INDEX IF NOT EXISTS idx_phone_opt_ins_person
  ON phone_opt_ins (person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phone_opt_ins_profile
  ON phone_opt_ins (profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phone_opt_ins_host_profile
  ON phone_opt_ins (host_profile_id) WHERE host_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phone_opt_ins_active
  ON phone_opt_ins (phone_e164, channel, host_profile_id)
  WHERE opted_out_at IS NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_phone_opt_ins_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_phone_opt_ins_updated_at ON phone_opt_ins;
CREATE TRIGGER trg_phone_opt_ins_updated_at
  BEFORE UPDATE ON phone_opt_ins
  FOR EACH ROW EXECUTE FUNCTION public.set_phone_opt_ins_updated_at();

-- Backend-only via service_role.
ALTER TABLE phone_opt_ins ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE phone_opt_ins IS
  'Per-(phone, channel, host) consent records. Append-only history; opt-outs flip opted_out_at rather than deleting.';
COMMENT ON COLUMN phone_opt_ins.source IS
  'Where consent was captured: rsvp_form / self_service / vip_invite / host_signup / admin_csv_import / public_opt_in_page.';
COMMENT ON COLUMN phone_opt_ins.host_profile_id IS
  'Which host this opt-in applies to. NULL = global PullUp-wide opt-in. Allows the per-host data-trust model.';
COMMENT ON COLUMN phone_opt_ins.legal_basis IS
  'GDPR Art. 6 basis: consent / contract / legitimate_interests / legal_obligation.';
