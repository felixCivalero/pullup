-- Server-side CRM aggregation for the MCP.
--
-- Single SQL function the MCP calls via /host/crm/summary. Computes events,
-- RSVPs, unique-people, plus-ones, dinner, top-N attendees, and top-N
-- events in ONE round-trip with one set of CTE scans. Replaces a previous
-- approach that fetched every CRM person and aggregated in Node.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION host_crm_summary(p_user_id uuid, p_top_n int DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH
  -- All events this user hosts (legacy host_id OR multi-host event_hosts row).
  host_events AS (
    SELECT DISTINCT e.id, e.title, e.slug, e.status, e.starts_at
    FROM events e
    WHERE e.host_id = p_user_id
       OR EXISTS (SELECT 1 FROM event_hosts eh WHERE eh.event_id = e.id AND eh.user_id = p_user_id)
  ),
  events_agg AS (
    SELECT
      COUNT(*)                                                AS total,
      COUNT(*) FILTER (WHERE status = 'PUBLISHED')            AS published,
      COUNT(*) FILTER (WHERE status = 'DRAFT')                AS draft,
      COUNT(*) FILTER (WHERE starts_at > NOW())               AS upcoming,
      COUNT(*) FILTER (WHERE starts_at <= NOW())              AS past
    FROM host_events
  ),
  host_rsvps AS (
    SELECT r.*
    FROM rsvps r
    WHERE r.event_id IN (SELECT id FROM host_events)
  ),
  rsvps_agg AS (
    SELECT
      COUNT(*) FILTER (WHERE booking_status = 'CONFIRMED' OR status = 'attending')              AS confirmed,
      COUNT(*) FILTER (WHERE booking_status = 'WAITLIST'  OR status = 'waitlist')                AS waitlist,
      COUNT(DISTINCT person_id)                                                                  AS unique_people,
      COALESCE(SUM(plus_ones) FILTER (WHERE booking_status = 'CONFIRMED' OR status = 'attending'), 0) AS total_plus_ones,
      COUNT(*) FILTER (
        WHERE (booking_status = 'CONFIRMED' OR status = 'attending')
          AND (wants_dinner = true OR (dinner->>'enabled')::boolean = true)
      )                                                                                          AS dinners
    FROM host_rsvps
  ),
  top_attendees AS (
    SELECT p.id, p.name, p.email, COUNT(*) AS events_attended
    FROM host_rsvps r
    JOIN people p ON p.id = r.person_id
    WHERE r.booking_status = 'CONFIRMED' OR r.status = 'attending'
    GROUP BY p.id, p.name, p.email
    ORDER BY events_attended DESC, p.created_at DESC
    LIMIT p_top_n
  ),
  top_events AS (
    SELECT
      e.id,
      e.title,
      e.slug,
      COUNT(r.id) FILTER (WHERE r.booking_status = 'CONFIRMED' OR r.status = 'attending')
        + COALESCE(SUM(r.plus_ones) FILTER (WHERE r.booking_status = 'CONFIRMED' OR r.status = 'attending'), 0) AS attendance
    FROM host_events e
    LEFT JOIN host_rsvps r ON r.event_id = e.id
    GROUP BY e.id, e.title, e.slug
    HAVING COUNT(r.id) FILTER (WHERE r.booking_status = 'CONFIRMED' OR r.status = 'attending') > 0
    ORDER BY attendance DESC
    LIMIT p_top_n
  )
SELECT jsonb_build_object(
  'events',       (SELECT row_to_json(events_agg) FROM events_agg),
  'rsvps',        (SELECT row_to_json(rsvps_agg)  FROM rsvps_agg),
  'topAttendees', COALESCE((SELECT jsonb_agg(row_to_json(top_attendees)) FROM top_attendees), '[]'::jsonb),
  'topEvents',    COALESCE((SELECT jsonb_agg(row_to_json(top_events))    FROM top_events),    '[]'::jsonb)
);
$$;

-- Service role calls this from the backend, which bypasses RLS. We don't
-- grant EXECUTE to anon/authenticated — only service_role can run it.
REVOKE ALL ON FUNCTION host_crm_summary(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION host_crm_summary(uuid, int) TO service_role;
