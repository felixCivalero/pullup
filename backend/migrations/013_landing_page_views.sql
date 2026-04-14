-- Per-row landing page views with source tracking (replaces aggregate page_views_daily for landing)
CREATE TABLE IF NOT EXISTS landing_page_views (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id   TEXT,
  referrer     TEXT,
  source       TEXT,               -- detected source: direct, instagram, pullup, google, etc.
  device_type  TEXT,               -- mobile / desktop
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_page_views_created_at ON landing_page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_landing_page_views_dedup ON landing_page_views(visitor_id, source, created_at);
