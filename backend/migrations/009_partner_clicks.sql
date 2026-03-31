-- Partner click tracking for collaborator CTAs (Zoda, etc.)
CREATE TABLE IF NOT EXISTS partner_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_slug TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  event_id UUID NOT NULL REFERENCES events(id),
  placement TEXT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT
);

-- For filtering by brand in admin
CREATE INDEX idx_partner_clicks_partner_slug ON partner_clicks(partner_slug);

-- For event-level analytics
CREATE INDEX idx_partner_clicks_event_id ON partner_clicks(event_id);

-- For user-level analytics
CREATE INDEX idx_partner_clicks_user_id ON partner_clicks(user_id);

-- For time-range queries per partner
CREATE INDEX idx_partner_clicks_partner_time ON partner_clicks(partner_slug, clicked_at);
