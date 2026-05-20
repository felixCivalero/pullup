-- Server-side aggregations for the MCP. Each function runs entirely in
-- Postgres so the MCP tools that call them are a single round-trip.
--
-- All functions: STABLE, LANGUAGE sql, GRANTed only to service_role. The
-- backend calls them via supabase.rpc() with the authenticated host's
-- user_id; they're not callable from anon/authenticated client roles.
--
-- Idempotent: CREATE OR REPLACE.

-- ─── 1. Revenue summary ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION host_revenue_summary(p_user_id uuid, p_top_n int DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH
  host_events AS (
    SELECT DISTINCT e.id, e.title, e.slug, e.starts_at
    FROM events e
    WHERE e.host_id = p_user_id
       OR EXISTS (SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = p_user_id)
  ),
  host_payments AS (
    SELECT p.id, p.event_id, p.rsvp_id, p.amount, p.refunded_amount, p.currency, p.paid_at
    FROM payments p
    WHERE p.event_id IN (SELECT id FROM host_events)
      AND p.status IN ('succeeded', 'paid')
  ),
  totals AS (
    SELECT
      COUNT(*)                                                       AS payments,
      COUNT(*) FILTER (WHERE refunded_amount > 0)                    AS refunded_payments,
      COALESCE(SUM(amount), 0)                                       AS gross_cents,
      COALESCE(SUM(refunded_amount), 0)                              AS refunded_cents,
      COALESCE(SUM(amount - COALESCE(refunded_amount, 0)), 0)        AS net_cents,
      COUNT(DISTINCT r.person_id)                                    AS unique_payers
    FROM host_payments hp
    LEFT JOIN rsvps r ON r.id = hp.rsvp_id
  ),
  top_events_by_revenue AS (
    SELECT
      e.id, e.title, e.slug,
      COALESCE(SUM(p.amount - COALESCE(p.refunded_amount, 0)), 0) AS net_cents,
      COUNT(p.id)                                                  AS payments
    FROM host_events e
    LEFT JOIN host_payments p ON p.event_id = e.id
    GROUP BY e.id, e.title, e.slug
    HAVING COALESCE(SUM(p.amount - COALESCE(p.refunded_amount, 0)), 0) > 0
    ORDER BY net_cents DESC
    LIMIT p_top_n
  )
SELECT jsonb_build_object(
  'currency',  COALESCE((SELECT currency FROM host_payments LIMIT 1), 'usd'),
  'totals',    (SELECT row_to_json(totals) FROM totals),
  'topEventsByRevenue', COALESCE((SELECT jsonb_agg(row_to_json(top_events_by_revenue)) FROM top_events_by_revenue), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION host_revenue_summary(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION host_revenue_summary(uuid, int) TO service_role;

-- ─── 2. Attendance trends (monthly time series) ─────────────────────────
CREATE OR REPLACE FUNCTION host_attendance_trends(p_user_id uuid, p_months int DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH
  host_events AS (
    SELECT DISTINCT e.id, e.starts_at, date_trunc('month', e.starts_at) AS month
    FROM events e
    WHERE (e.host_id = p_user_id
       OR EXISTS (SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = p_user_id))
      AND e.starts_at >= date_trunc('month', NOW()) - ((p_months - 1) || ' months')::interval
  ),
  rsvps_per_event AS (
    SELECT
      he.id AS event_id,
      he.month,
      COUNT(r.id) FILTER (WHERE r.booking_status = 'CONFIRMED' OR r.status = 'attending') AS confirmed_rsvps,
      COALESCE(SUM(r.plus_ones) FILTER (WHERE r.booking_status = 'CONFIRMED' OR r.status = 'attending'), 0) AS plus_ones,
      COUNT(r.id) FILTER (WHERE r.pulled_up = true) AS pulled_up
    FROM host_events he
    LEFT JOIN rsvps r ON r.event_id = he.id
    GROUP BY he.id, he.month
  ),
  monthly AS (
    SELECT
      month,
      COUNT(*) AS events,
      COALESCE(SUM(confirmed_rsvps), 0) AS confirmed_rsvps,
      COALESCE(SUM(plus_ones), 0)       AS plus_ones,
      COALESCE(SUM(pulled_up), 0)       AS pulled_up
    FROM rsvps_per_event
    GROUP BY month
    ORDER BY month
  )
SELECT jsonb_build_object(
  'monthsRequested', p_months,
  'months', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'month',           to_char(month, 'YYYY-MM'),
    'events',          events,
    'confirmedRsvps',  confirmed_rsvps,
    'plusOnes',        plus_ones,
    'totalGuests',     confirmed_rsvps + plus_ones,
    'pulledUp',        pulled_up,
    'showUpRatePct',   CASE WHEN confirmed_rsvps > 0
                            THEN ROUND(100.0 * pulled_up / confirmed_rsvps, 1)
                            ELSE NULL END
  ) ORDER BY month) FROM monthly), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION host_attendance_trends(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION host_attendance_trends(uuid, int) TO service_role;

-- ─── 3. Audience segments ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION host_audience_segments(p_user_id uuid, p_top_n int DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH
  host_events AS (
    SELECT DISTINCT e.id
    FROM events e
    WHERE e.host_id = p_user_id
       OR EXISTS (SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = p_user_id)
  ),
  person_attendance AS (
    SELECT
      r.person_id,
      COUNT(*) FILTER (WHERE r.booking_status = 'CONFIRMED' OR r.status = 'attending') AS attended,
      bool_or(COALESCE(r.is_vip, false))                          AS is_vip,
      bool_or(COALESCE(r.marketing_opt_in, false))                AS marketing_opt_in,
      bool_or(r.wants_dinner = true OR (r.dinner->>'enabled')::boolean = true) AS ever_dinner
    FROM rsvps r
    WHERE r.event_id IN (SELECT id FROM host_events)
    GROUP BY r.person_id
  ),
  segments AS (
    SELECT
      COUNT(*)                                  AS total_people,
      COUNT(*) FILTER (WHERE attended = 1)      AS first_timers,
      COUNT(*) FILTER (WHERE attended BETWEEN 2 AND 4) AS occasional,
      COUNT(*) FILTER (WHERE attended >= 5)     AS regulars,
      COUNT(*) FILTER (WHERE is_vip)            AS vips,
      COUNT(*) FILTER (WHERE marketing_opt_in)  AS marketing_consented,
      COUNT(*) FILTER (WHERE ever_dinner)       AS dinner_attenders
    FROM person_attendance
    WHERE attended >= 1
  ),
  top_spenders AS (
    SELECT p.id, p.name, p.email,
           COALESCE(p.total_spend, 0) AS total_spend_cents,
           pa.attended
    FROM people p
    JOIN person_attendance pa ON pa.person_id = p.id
    WHERE pa.attended >= 1 AND COALESCE(p.total_spend, 0) > 0
    ORDER BY p.total_spend DESC NULLS LAST
    LIMIT p_top_n
  )
SELECT jsonb_build_object(
  'segments',    (SELECT row_to_json(segments) FROM segments),
  'topSpenders', COALESCE((SELECT jsonb_agg(row_to_json(top_spenders)) FROM top_spenders), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION host_audience_segments(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION host_audience_segments(uuid, int) TO service_role;

-- ─── 4. Recent activity ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION host_recent_activity(p_user_id uuid, p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH
  cutoff AS (SELECT NOW() - (p_days || ' days')::interval AS t),
  host_events AS (
    SELECT DISTINCT e.id, e.title, e.slug
    FROM events e
    WHERE e.host_id = p_user_id
       OR EXISTS (SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = p_user_id)
  ),
  recent_rsvps AS (
    SELECT r.*
    FROM rsvps r
    WHERE r.event_id IN (SELECT id FROM host_events)
      AND r.created_at >= (SELECT t FROM cutoff)
  ),
  new_people AS (
    -- Person's FIRST RSVP to any of this host's events falls in the window.
    SELECT COUNT(DISTINCT r.person_id) AS count
    FROM rsvps r
    WHERE r.event_id IN (SELECT id FROM host_events)
      AND r.created_at >= (SELECT t FROM cutoff)
      AND NOT EXISTS (
        SELECT 1 FROM rsvps r2
        WHERE r2.person_id = r.person_id
          AND r2.event_id IN (SELECT id FROM host_events)
          AND r2.created_at < (SELECT t FROM cutoff)
      )
  ),
  recent_revenue AS (
    SELECT
      COALESCE(SUM(amount - COALESCE(refunded_amount, 0)), 0) AS net_cents,
      COUNT(*) AS payments
    FROM payments
    WHERE event_id IN (SELECT id FROM host_events)
      AND status IN ('succeeded', 'paid')
      AND paid_at >= (SELECT t FROM cutoff)
  ),
  recent_pageviews AS (
    SELECT
      COUNT(*) AS views,
      COUNT(DISTINCT visitor_id) AS unique_visitors
    FROM event_page_views
    WHERE event_id IN (SELECT id FROM host_events)
      AND created_at >= (SELECT t FROM cutoff)
  ),
  trending_events AS (
    SELECT e.id, e.title, e.slug, COUNT(r.id) AS recent_rsvps
    FROM host_events e
    JOIN recent_rsvps r ON r.event_id = e.id
    GROUP BY e.id, e.title, e.slug
    ORDER BY recent_rsvps DESC
    LIMIT 5
  )
SELECT jsonb_build_object(
  'sinceDays',      p_days,
  'rsvpsReceived',  (SELECT COUNT(*) FROM recent_rsvps),
  'newPeople',      (SELECT count FROM new_people),
  'revenue',        (SELECT row_to_json(recent_revenue) FROM recent_revenue),
  'pageViews',      (SELECT row_to_json(recent_pageviews) FROM recent_pageviews),
  'currency',       COALESCE((SELECT currency FROM payments WHERE event_id IN (SELECT id FROM host_events) LIMIT 1), 'usd'),
  'trendingEvents', COALESCE((SELECT jsonb_agg(row_to_json(trending_events)) FROM trending_events), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION host_recent_activity(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION host_recent_activity(uuid, int) TO service_role;

-- ─── 5. Email / campaign summary ────────────────────────────────────────
CREATE OR REPLACE FUNCTION host_email_summary(p_user_id uuid, p_top_n int DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH
  host_campaigns AS (
    SELECT id, name, subject, sent_at, total_sent, total_recipients
    FROM campaign_campaigns
    WHERE user_id = p_user_id
      AND sent_at IS NOT NULL
  ),
  sends_agg AS (
    SELECT
      cs.campaign_id,
      COUNT(*)                                            AS sent,
      COUNT(*) FILTER (WHERE cs.delivered_at IS NOT NULL) AS delivered,
      COUNT(*) FILTER (WHERE cs.opened_at IS NOT NULL)    AS opened,
      COUNT(*) FILTER (WHERE cs.clicked_at IS NOT NULL)   AS clicked,
      COUNT(*) FILTER (WHERE cs.bounced_at IS NOT NULL)   AS bounced,
      COUNT(*) FILTER (WHERE cs.complained_at IS NOT NULL) AS complained
    FROM campaign_sends cs
    WHERE cs.campaign_id IN (SELECT id FROM host_campaigns)
    GROUP BY cs.campaign_id
  ),
  totals AS (
    SELECT
      COUNT(DISTINCT hc.id)                AS campaigns_sent,
      COALESCE(SUM(s.sent), 0)             AS total_sent,
      COALESCE(SUM(s.delivered), 0)        AS total_delivered,
      COALESCE(SUM(s.opened), 0)           AS total_opened,
      COALESCE(SUM(s.clicked), 0)          AS total_clicked,
      COALESCE(SUM(s.bounced), 0)          AS total_bounced,
      COALESCE(SUM(s.complained), 0)       AS total_complained,
      CASE WHEN SUM(s.sent) > 0 THEN ROUND(100.0 * SUM(s.opened)  / SUM(s.sent), 1) END AS open_rate_pct,
      CASE WHEN SUM(s.sent) > 0 THEN ROUND(100.0 * SUM(s.clicked) / SUM(s.sent), 1) END AS click_rate_pct,
      CASE WHEN SUM(s.sent) > 0 THEN ROUND(100.0 * SUM(s.bounced) / SUM(s.sent), 2) END AS bounce_rate_pct
    FROM host_campaigns hc
    LEFT JOIN sends_agg s ON s.campaign_id = hc.id
  ),
  top_by_open_rate AS (
    SELECT
      hc.name, hc.subject, hc.sent_at,
      s.sent, s.opened, s.clicked,
      CASE WHEN s.sent > 0 THEN ROUND(100.0 * s.opened  / s.sent, 1) END AS open_rate_pct,
      CASE WHEN s.sent > 0 THEN ROUND(100.0 * s.clicked / s.sent, 1) END AS click_rate_pct
    FROM host_campaigns hc
    JOIN sends_agg s ON s.campaign_id = hc.id
    WHERE s.sent > 0
    ORDER BY (s.opened::float / s.sent) DESC, s.sent DESC
    LIMIT p_top_n
  )
SELECT jsonb_build_object(
  'totals',         (SELECT row_to_json(totals) FROM totals),
  'topByOpenRate',  COALESCE((SELECT jsonb_agg(row_to_json(top_by_open_rate)) FROM top_by_open_rate), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION host_email_summary(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION host_email_summary(uuid, int) TO service_role;
