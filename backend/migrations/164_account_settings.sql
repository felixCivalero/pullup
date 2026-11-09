-- 164: one row of settings per organiser account (/admin/platform, the
-- owner's "Kundavtal"; lib/accountSettings.js). account_limits (mig 163, the
-- limits) becomes account_settings and gains the good side: how the account
-- pays, its price, a higher mail cap, its own pages without PullUp's line,
-- the agreement, and early features. No row = a normal account.
ALTER TABLE IF EXISTS account_limits RENAME TO account_settings;

ALTER TABLE account_settings
  ADD COLUMN IF NOT EXISTS billing text NOT NULL DEFAULT 'stripe' CHECK (billing IN ('stripe', 'invoice')),
  -- invoice: sends may run the balance down to -credit_limit, PullUp invoices after
  ADD COLUMN IF NOT EXISTS credit_limit integer NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  -- SEK ex moms per 1 000 sends on the invoice (null = the small pack's price)
  ADD COLUMN IF NOT EXISTS price_per_1000_sek numeric(10,2) CHECK (price_per_1000_sek IS NULL OR price_per_1000_sek >= 0),
  -- trusted: ten times the hourly cap on free confirmation mails (big launches)
  ADD COLUMN IF NOT EXISTS trusted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_branding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS features text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS org_number text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS invoice_ref text,
  ADD COLUMN IF NOT EXISTS dpa_signed_at date,
  ADD COLUMN IF NOT EXISTS contract_until date;

-- An invoice settles what an invoice customer sent past its balance.
ALTER TABLE email_credit_ledger DROP CONSTRAINT IF EXISTS email_credit_ledger_reason_check;
ALTER TABLE email_credit_ledger ADD CONSTRAINT email_credit_ledger_reason_check CHECK (reason IN ('purchase', 'send', 'refund', 'adjust', 'invoice'));

CREATE TABLE IF NOT EXISTS account_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number text NOT NULL UNIQUE,
  period_from timestamptz,
  period_to timestamptz NOT NULL,
  sends integer NOT NULL CHECK (sends > 0),
  price_per_1000_sek numeric(10,2) NOT NULL,
  amount_sek numeric(12,2) NOT NULL,
  vat_sek numeric(12,2) NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS account_invoices_host ON account_invoices (host_id, created_at DESC);
ALTER TABLE account_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_invoices FROM anon, authenticated, PUBLIC;

-- Taking sends: an invoice customer may go below zero, down to its credit limit.
CREATE OR REPLACE FUNCTION public.reserve_email_credits(p_host uuid, p_count integer, p_tag text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE bal INTEGER; floor_ INTEGER;
BEGIN
  IF p_count <= 0 THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('email_credits:' || p_host::text));
  SELECT COALESCE(SUM(delta), 0) INTO bal FROM email_credit_ledger WHERE host_id = p_host;
  SELECT COALESCE((SELECT CASE WHEN billing = 'invoice' THEN -credit_limit ELSE 0 END FROM account_settings WHERE host_id = p_host), 0) INTO floor_;
  IF bal - p_count < floor_ THEN RETURN NULL; END IF;
  INSERT INTO email_credit_ledger (host_id, delta, reason, campaign_tag) VALUES (p_host, -p_count, 'send', p_tag);
  RETURN bal - p_count;
END;
$function$;
REVOKE ALL ON FUNCTION reserve_email_credits(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
