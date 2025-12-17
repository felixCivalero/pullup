-- Add Stripe Connect account ID column to profiles table
-- This stores the connected Stripe account ID for hosts who have connected their Stripe account
-- via Stripe Connect OAuth flow

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connected_account_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_connected_account_id 
ON profiles(stripe_connected_account_id) 
WHERE stripe_connected_account_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.stripe_connected_account_id IS 'Stripe Connect account ID for hosts who have connected their Stripe account via OAuth';
