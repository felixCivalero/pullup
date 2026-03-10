-- 005_email_tracking.sql
-- Adds open/click tracking for newsletters + event page view tracking

-- 1) Add tracking columns to email_outbox
ALTER TABLE email_outbox
  ADD COLUMN IF NOT EXISTS tracking_id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS campaign_tag TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbox_tracking_id
  ON email_outbox(tracking_id);

CREATE INDEX IF NOT EXISTS idx_email_outbox_campaign_tag
  ON email_outbox(campaign_tag) WHERE campaign_tag IS NOT NULL;

-- 2) Email opens (tracking pixel hits)
CREATE TABLE IF NOT EXISTS email_opens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id   UUID REFERENCES email_outbox(id) ON DELETE CASCADE,
  tracking_id UUID NOT NULL,
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent  TEXT,
  ip_address  TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_opens_outbox_id   ON email_opens(outbox_id);
CREATE INDEX IF NOT EXISTS idx_email_opens_tracking_id ON email_opens(tracking_id);

-- 3) Email clicks (link redirect hits)
CREATE TABLE IF NOT EXISTS email_clicks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id   UUID REFERENCES email_outbox(id) ON DELETE CASCADE,
  tracking_id UUID NOT NULL,
  link_url    TEXT NOT NULL,
  link_label  TEXT,
  link_index  INT,
  event_id    UUID,               -- optional: which stockholm_event was clicked
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent  TEXT,
  ip_address  TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_clicks_outbox_id   ON email_clicks(outbox_id);
CREATE INDEX IF NOT EXISTS idx_email_clicks_tracking_id ON email_clicks(tracking_id);
CREATE INDEX IF NOT EXISTS idx_email_clicks_event_id    ON email_clicks(event_id) WHERE event_id IS NOT NULL;

-- 4) Event page views (for host analytics)
CREATE TABLE IF NOT EXISTS event_page_views (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL,
  visitor_id   TEXT,               -- random localStorage ID for dedup
  referrer     TEXT,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  utm_content  TEXT,
  device_type  TEXT,               -- mobile / desktop / tablet
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_page_views_event_id   ON event_page_views(event_id);
CREATE INDEX IF NOT EXISTS idx_event_page_views_created_at ON event_page_views(created_at);
-- Dedup index: one view per visitor per event per 30-min window
CREATE INDEX IF NOT EXISTS idx_event_page_views_dedup
  ON event_page_views(event_id, visitor_id, created_at);
