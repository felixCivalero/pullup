-- Create email templates, campaigns, and sends tables
-- Migration: create_email_tables.sql
-- Date: December 17, 2025

-- Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  header_text TEXT,
  headline TEXT NOT NULL,
  body_text TEXT NOT NULL,
  cta_text TEXT NOT NULL DEFAULT 'Book Now',
  cta_url TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX idx_email_templates_is_default ON email_templates(is_default);

-- Email Campaigns Table
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'paused'
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused'))
);

CREATE INDEX idx_email_campaigns_user_id ON email_campaigns(user_id);
CREATE INDEX idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_email_campaigns_template_id ON email_campaigns(template_id);

-- Email Sends Table (individual email tracking)
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  resend_email_id TEXT, -- Resend email ID for tracking
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_email_status CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'))
);

CREATE INDEX idx_email_sends_campaign_id ON email_sends(campaign_id);
CREATE INDEX idx_email_sends_person_id ON email_sends(person_id);
CREATE INDEX idx_email_sends_status ON email_sends(status);
CREATE INDEX idx_email_sends_resend_email_id ON email_sends(resend_email_id);
CREATE INDEX idx_email_sends_email ON email_sends(email);

-- CRM Views Table (saved filter views)
CREATE TABLE IF NOT EXISTS crm_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}', -- { field: value, operator: 'equals'|'contains'|'greater_than'|etc }
  sort_by TEXT DEFAULT 'created_at',
  sort_order TEXT DEFAULT 'desc',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_sort_order CHECK (sort_order IN ('asc', 'desc'))
);

CREATE INDEX idx_crm_views_user_id ON crm_views(user_id);
CREATE INDEX idx_crm_views_is_default ON crm_views(is_default);

-- Enable RLS on all tables
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data

-- Email Templates
CREATE POLICY "Users can view own email templates"
  ON email_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own email templates"
  ON email_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email templates"
  ON email_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own email templates"
  ON email_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Email Campaigns
CREATE POLICY "Users can view own email campaigns"
  ON email_campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own email campaigns"
  ON email_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email campaigns"
  ON email_campaigns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own email campaigns"
  ON email_campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- Email Sends (users can view sends for their campaigns)
CREATE POLICY "Users can view email sends for own campaigns"
  ON email_sends FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM email_campaigns
      WHERE email_campaigns.id = email_sends.campaign_id
      AND email_campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert email sends"
  ON email_sends FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update email sends"
  ON email_sends FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- CRM Views
CREATE POLICY "Users can view own CRM views"
  ON crm_views FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own CRM views"
  ON crm_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own CRM views"
  ON crm_views FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own CRM views"
  ON crm_views FOR DELETE
  USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE email_templates IS 'Reusable email templates for campaigns';
COMMENT ON TABLE email_campaigns IS 'Email campaign management';
COMMENT ON TABLE email_sends IS 'Individual email tracking with Resend integration';
COMMENT ON TABLE crm_views IS 'Saved filter views/tabs for CRM';
