-- Create payments table for Stripe payment tracking
-- This table stores payment records linked to events, RSVPs, and users

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rsvp_id UUID REFERENCES rsvps(id) ON DELETE SET NULL,
  
  -- Stripe identifiers
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  stripe_charge_id TEXT,
  stripe_checkout_session_id TEXT,
  
  -- Payment details
  amount INTEGER NOT NULL, -- Amount in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'succeeded' | 'failed' | 'refunded' | 'canceled'
  payment_method TEXT,
  description TEXT,
  receipt_url TEXT,
  
  -- Refund tracking
  refunded_amount INTEGER DEFAULT 0,
  refunded_at TIMESTAMPTZ,
  
  -- Timestamps
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata for extensibility
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_event_id ON payments(event_id);
CREATE INDEX IF NOT EXISTS idx_payments_rsvp_id ON payments(rsvp_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_charge_id ON payments(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Add RLS policies
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own payments
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can view payments for events they host
CREATE POLICY "Hosts can view event payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = payments.event_id
      AND events.host_id = auth.uid()
    )
  );

-- Policy: System can insert payments (via service role)
CREATE POLICY "Service role can insert payments"
  ON payments FOR INSERT
  WITH CHECK (true);

-- Policy: System can update payments (via service role)
CREATE POLICY "Service role can update payments"
  ON payments FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE payments IS 'Stores payment records for paid events, linked to Stripe payment intents';
COMMENT ON COLUMN payments.user_id IS 'The person/user who made the payment';
COMMENT ON COLUMN payments.event_id IS 'The event this payment is for';
COMMENT ON COLUMN payments.rsvp_id IS 'The RSVP this payment is linked to (if applicable)';
COMMENT ON COLUMN payments.amount IS 'Payment amount in cents (e.g., 2000 = $20.00)';
COMMENT ON COLUMN payments.status IS 'Payment status: pending, succeeded, failed, refunded, or canceled';


