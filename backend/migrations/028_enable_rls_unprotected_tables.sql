-- Audit Top 10 #6: enable RLS on 10 tables that were publicly readable via the
-- anon key. All current access flows through the backend's service_role client,
-- which bypasses RLS, so adding zero policies makes these tables effectively
-- service_role-only — the intended posture.
--
-- The big risk this closes: vip_invites.token (active invite tokens) was
-- enumerable by anyone holding the anon key, which ships in the frontend
-- bundle. Same story for analytics tables (email_opens/clicks, page_views,
-- partner_clicks) which leaked aggregated user behavior.
--
-- Idempotent — re-running ENABLE ROW LEVEL SECURITY on a table that already
-- has it is a no-op.

ALTER TABLE public.vip_invites           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_opens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_clicks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_page_views      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_views    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_clicks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stockholm_events      ENABLE ROW LEVEL SECURITY;
