-- Fix host_email_summary so it reads opens/clicks from the actual
-- source-of-truth tables.
--
-- The original v1 (migration 023) read campaign_sends.opened_at /
-- clicked_at / bounced_at — but PullUp's own tracking pipeline writes to
-- `email_opens` and `email_clicks` (via the /t/o/:tid open pixel and
-- /t/c/:tid click redirect in src/email/tracking/trackingRoutes.js). Those
-- columns on campaign_sends are never populated, so the v1 function
-- reported 0% opens for every campaign even though the events were
-- actually being recorded.
--
-- The join chain is:
--   campaign_sends.id  →  email_outbox.campaign_send_id
--                      →  email_opens.outbox_id   (one row per recipient open)
--                      →  email_clicks.outbox_id  (one row per click)
--
-- Delivered / bounced / failed are read from email_outbox.status, which
-- is updated by the provider webhook (sesSnsWebhook.js).

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
  -- One row per campaign_sends.id, with per-recipient deliver/open/click
  -- booleans pulled via the email_outbox bridge. EXISTS is intentional:
  -- a recipient who clicks N times still counts as one "clicked".
  per_recipient AS (
    SELECT
      cs.id           AS send_id,
      cs.campaign_id,
      EXISTS (
        SELECT 1 FROM email_outbox o
        WHERE o.campaign_send_id = cs.id AND o.status = 'delivered'
      )               AS delivered,
      EXISTS (
        SELECT 1 FROM email_outbox o
        WHERE o.campaign_send_id = cs.id AND o.status = 'bounced'
      )               AS bounced,
      EXISTS (
        SELECT 1 FROM email_outbox o
        WHERE o.campaign_send_id = cs.id AND o.status = 'failed'
      )               AS failed,
      EXISTS (
        SELECT 1 FROM email_opens eo
        JOIN email_outbox o ON o.id = eo.outbox_id
        WHERE o.campaign_send_id = cs.id
      )               AS opened,
      EXISTS (
        SELECT 1 FROM email_clicks ec
        JOIN email_outbox o ON o.id = ec.outbox_id
        WHERE o.campaign_send_id = cs.id
      )               AS clicked
    FROM campaign_sends cs
    WHERE cs.campaign_id IN (SELECT id FROM host_campaigns)
  ),
  per_campaign AS (
    SELECT
      campaign_id,
      COUNT(*)                                AS sent,
      COUNT(*) FILTER (WHERE delivered)       AS delivered,
      COUNT(*) FILTER (WHERE bounced)         AS bounced,
      COUNT(*) FILTER (WHERE failed)          AS failed,
      COUNT(*) FILTER (WHERE opened)          AS opened,
      COUNT(*) FILTER (WHERE clicked)         AS clicked
    FROM per_recipient
    GROUP BY campaign_id
  ),
  totals AS (
    SELECT
      COUNT(DISTINCT hc.id)                AS campaigns_sent,
      COALESCE(SUM(pc.sent), 0)            AS total_sent,
      COALESCE(SUM(pc.delivered), 0)       AS total_delivered,
      COALESCE(SUM(pc.opened), 0)          AS total_opened,
      COALESCE(SUM(pc.clicked), 0)         AS total_clicked,
      COALESCE(SUM(pc.bounced), 0)         AS total_bounced,
      COALESCE(SUM(pc.failed), 0)          AS total_failed,
      0::int                               AS total_complained,
      CASE WHEN SUM(pc.sent) > 0 THEN ROUND(100.0 * SUM(pc.opened)  / SUM(pc.sent), 1) END AS open_rate_pct,
      CASE WHEN SUM(pc.sent) > 0 THEN ROUND(100.0 * SUM(pc.clicked) / SUM(pc.sent), 1) END AS click_rate_pct,
      CASE WHEN SUM(pc.sent) > 0 THEN ROUND(100.0 * SUM(pc.bounced) / SUM(pc.sent), 2) END AS bounce_rate_pct
    FROM host_campaigns hc
    LEFT JOIN per_campaign pc ON pc.campaign_id = hc.id
  ),
  top_by_open_rate AS (
    SELECT
      hc.name, hc.subject, hc.sent_at,
      pc.sent, pc.opened, pc.clicked,
      CASE WHEN pc.sent > 0 THEN ROUND(100.0 * pc.opened  / pc.sent, 1) END AS open_rate_pct,
      CASE WHEN pc.sent > 0 THEN ROUND(100.0 * pc.clicked / pc.sent, 1) END AS click_rate_pct
    FROM host_campaigns hc
    JOIN per_campaign pc ON pc.campaign_id = hc.id
    WHERE pc.sent > 0
    ORDER BY (pc.opened::float / pc.sent) DESC, pc.sent DESC
    LIMIT p_top_n
  )
SELECT jsonb_build_object(
  'totals',         (SELECT row_to_json(totals) FROM totals),
  'topByOpenRate',  COALESCE((SELECT jsonb_agg(row_to_json(top_by_open_rate)) FROM top_by_open_rate), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION host_email_summary(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION host_email_summary(uuid, int) TO service_role;
