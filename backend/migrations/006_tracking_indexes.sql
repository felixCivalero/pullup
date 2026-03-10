-- 006_tracking_indexes.sql
-- Performance indexes for tracking analytics queries

-- Composite index for time-range queries on page views per event
CREATE INDEX IF NOT EXISTS idx_event_page_views_event_created
  ON event_page_views(event_id, created_at DESC);

-- Index for campaign-scoped open/click queries (used by per-campaign analytics)
CREATE INDEX IF NOT EXISTS idx_email_opens_tracking_opened
  ON email_opens(tracking_id, opened_at);

CREATE INDEX IF NOT EXISTS idx_email_clicks_tracking_clicked
  ON email_clicks(tracking_id, clicked_at);

-- Index for outbox campaign + status filtering
CREATE INDEX IF NOT EXISTS idx_email_outbox_campaign_status
  ON email_outbox(campaign_tag, status) WHERE campaign_tag IS NOT NULL;

-- Index for click link_url grouping (top clicked links queries)
CREATE INDEX IF NOT EXISTS idx_email_clicks_link_url
  ON email_clicks(link_url);
