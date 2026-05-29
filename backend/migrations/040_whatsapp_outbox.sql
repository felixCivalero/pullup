-- 040_whatsapp_outbox.sql
-- WhatsApp delivery infrastructure: outbox, raw events, and suppressions.
-- Mirrors `email_outbox` / `email_events` / `email_suppressions` so the
-- patterns the codebase already trusts (claim RPC + FOR UPDATE SKIP LOCKED
-- worker, idempotency keys, provider abstraction) carry over.
--
-- Extras WhatsApp needs that email doesn't:
--   * Template registry — Meta requires every outbound message outside the
--     24h customer-service window to use a pre-approved template.
--   * Conversation window — Meta bills per 24h "conversation" opened by
--     the first templated message; freeform messages within an open
--     window are free. We track this for cost accounting + so the host
--     can reply without re-templating.
--   * Direction — same table records inbound replies so we can stream
--     them into the per-person thread view in the CRM.
--   * Country category — Meta pricing is per-country-category;
--     storing it on the row is what makes cost telemetry possible.
--
-- Idempotent: safe to re-run.

-- 1. whatsapp_outbox ---------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Routing identity. Either person or profile (or both) may link this
  -- message back to a known contact; bare phone is fine for verification
  -- flows where no DB record exists yet.
  person_id                UUID        REFERENCES people(id)   ON DELETE SET NULL,
  profile_id               UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  to_phone_e164            TEXT        NOT NULL CHECK (to_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),

  -- Sender. The Meta WABA phone-number-id (not the displayable number);
  -- premium-tier hosts may eventually have their own.
  from_phone_number_id     TEXT        NOT NULL,
  host_profile_id          UUID        REFERENCES profiles(id) ON DELETE SET NULL,

  direction                TEXT        NOT NULL CHECK (direction IN ('outbound','inbound')),

  -- Template + payload. template_key NULL for freeform replies inside the
  -- 24h window or for inbound rows.
  template_key             TEXT,
  template_locale          TEXT,
  template_variables       JSONB,
  body_text                TEXT,
  body_media               JSONB,   -- [{type:'image'|'video'|'audio'|'document', url, mime_type, caption?}]

  -- Meta classification + cost-driving fields.
  category                 TEXT        NOT NULL DEFAULT 'utility'
                                       CHECK (category IN ('authentication','utility','marketing','service')),
  conversation_window_open BOOLEAN     NOT NULL DEFAULT FALSE,
  provider                 TEXT        NOT NULL DEFAULT 'meta_cloud',
  provider_message_id      TEXT,
  provider_conversation_id TEXT,
  country                  TEXT,
  cost_micros              BIGINT,
  sandbox_mode             BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Delivery state.
  status                   TEXT        NOT NULL DEFAULT 'queued'
                                       CHECK (status IN (
                                         'queued','sending','sent','delivered',
                                         'read','replied','failed','suppressed'
                                       )),
  idempotency_key          TEXT        UNIQUE,
  send_after               TIMESTAMPTZ,
  attempts                 INT         NOT NULL DEFAULT 0,
  last_error_code          TEXT,
  last_error_message       TEXT,
  locked_at                TIMESTAMPTZ,
  locked_by                TEXT,

  sent_at                  TIMESTAMPTZ,
  delivered_at             TIMESTAMPTZ,
  read_at                  TIMESTAMPTZ,
  replied_at               TIMESTAMPTZ,
  failed_at                TIMESTAMPTZ,

  -- Linkage to campaign + tracking spine (mirror of email_outbox).
  tracking_id              UUID        DEFAULT gen_random_uuid(),
  campaign_send_id         UUID,
  campaign_tag             TEXT,
  legal_basis              TEXT,
  reply_to_message_id      UUID        REFERENCES whatsapp_outbox(id) ON DELETE SET NULL,
  raw_payload              JSONB,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status_send_after
  ON whatsapp_outbox (status, send_after)
  WHERE status IN ('queued','retrying');
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_to_phone
  ON whatsapp_outbox (to_phone_e164);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_person
  ON whatsapp_outbox (person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_host_profile
  ON whatsapp_outbox (host_profile_id) WHERE host_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_tracking
  ON whatsapp_outbox (tracking_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_campaign_send
  ON whatsapp_outbox (campaign_send_id) WHERE campaign_send_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_provider_message
  ON whatsapp_outbox (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- 2. whatsapp_events ---------------------------------------------------
-- Raw webhook events from Meta. Append-only audit trail; outbox.status
-- is the derived view.
CREATE TABLE IF NOT EXISTS whatsapp_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT        NOT NULL DEFAULT 'meta_cloud',
  provider_message_id TEXT,
  event_type          TEXT        NOT NULL,
  whatsapp_outbox_id  UUID        REFERENCES whatsapp_outbox(id) ON DELETE SET NULL,
  recipient           TEXT,
  payload             JSONB       NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_events_provider_message
  ON whatsapp_events (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_outbox
  ON whatsapp_events (whatsapp_outbox_id) WHERE whatsapp_outbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_type_time
  ON whatsapp_events (event_type, created_at DESC);

-- 3. whatsapp_suppressions --------------------------------------------
-- Phone numbers we must not WhatsApp again. Populated by: explicit
-- opt-outs, Meta marking number unreachable, user replying STOP, etc.
CREATE TABLE IF NOT EXISTS whatsapp_suppressions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164  TEXT        NOT NULL UNIQUE
                          CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  reason      TEXT        NOT NULL,
  source      TEXT        NOT NULL,
  details     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_suppressions_reason
  ON whatsapp_suppressions (reason);

-- 4. Worker claim RPC --------------------------------------------------
-- Mirrors claim_email_outbox_batch: recover stuck 'sending' rows, then
-- claim a batch under FOR UPDATE SKIP LOCKED.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbox_batch(
  p_worker_id TEXT,
  p_batch_size INT
)
RETURNS SETOF whatsapp_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE whatsapp_outbox
  SET status = 'queued',
      locked_at = NULL,
      locked_by = NULL,
      updated_at = NOW()
  WHERE status = 'sending'
    AND locked_at < NOW() - INTERVAL '5 minutes';

  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM whatsapp_outbox
    WHERE status IN ('queued')
      AND (send_after IS NULL OR send_after <= NOW())
      AND direction = 'outbound'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE whatsapp_outbox AS wo
  SET status = 'sending',
      locked_at = NOW(),
      locked_by = p_worker_id,
      updated_at = NOW()
  FROM cte
  WHERE wo.id = cte.id
  RETURNING wo.*;
END;
$$;

-- 5. updated_at triggers ----------------------------------------------
CREATE OR REPLACE FUNCTION public.set_whatsapp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_whatsapp_outbox_updated_at      ON whatsapp_outbox;
DROP TRIGGER IF EXISTS trg_whatsapp_events_updated_at      ON whatsapp_events;
DROP TRIGGER IF EXISTS trg_whatsapp_suppressions_updated_at ON whatsapp_suppressions;

CREATE TRIGGER trg_whatsapp_outbox_updated_at
  BEFORE UPDATE ON whatsapp_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_updated_at();
CREATE TRIGGER trg_whatsapp_events_updated_at
  BEFORE UPDATE ON whatsapp_events
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_updated_at();
CREATE TRIGGER trg_whatsapp_suppressions_updated_at
  BEFORE UPDATE ON whatsapp_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_updated_at();

-- 6. RLS — backend-only via service_role -------------------------------
ALTER TABLE whatsapp_outbox       ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_suppressions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE whatsapp_outbox IS
  'WhatsApp send/receive log. Mirrors email_outbox; same worker pattern. Includes inbound (direction=inbound) for thread reconstruction.';
COMMENT ON TABLE whatsapp_events IS
  'Raw Meta webhook events. Append-only audit trail.';
COMMENT ON TABLE whatsapp_suppressions IS
  'Phones we must not WA again (opt-outs, blocks, unreachable).';
COMMENT ON COLUMN whatsapp_outbox.conversation_window_open IS
  'Whether the 24h customer-service window was open when we sent. Drives freeform-vs-template choice and cost.';
COMMENT ON COLUMN whatsapp_outbox.cost_micros IS
  'Meta-billed cost in micro-USD (1e-6 USD). Stored at send-time per current Meta pricing for that country+category.';
