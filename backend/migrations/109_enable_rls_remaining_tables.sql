-- Security hardening #2: enable RLS on the 28 remaining public tables flagged
-- by the Supabase security advisor (lint 0013_rls_disabled_in_public).
--
-- Same posture as migration 028: all application access flows through the
-- backend's service_role client (backend/src/supabase.js), which BYPASSES RLS.
-- The frontend never reads these tables directly — the anon client is used only
-- for supabase.auth.*, Realtime, and storage.uploadToSignedUrl (verified: zero
-- supabase.from('<table>') calls in the frontend bundle). So enabling RLS with
-- zero policies makes these tables effectively service_role-only — the intended
-- posture — with NO change to any current code path.
--
-- Realtime safety: the supabase_realtime publication contains only host_actions
-- and person_events (verified via pg_publication_tables). NEITHER is in this
-- list, so enabling RLS here cannot break any live subscription.
--
-- The landmine this closes: anyone holding the anon key (it ships in the JS
-- bundle) could hit PostgREST directly against these tables. That includes
-- person_identities (emails/phones/IG handles), email_inbound (inbound email
-- bodies), the financial tables (transaction_ledger, payment_events,
-- payout_accounts), and admin_impersonation_log.
--
-- Idempotent — re-running ENABLE ROW LEVEL SECURITY on a table that already has
-- it is a no-op.

-- Identity / people graph (PII)
ALTER TABLE public.person_source_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_identities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_auth_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_merges            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_match_candidates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_reviews            ENABLE ROW LEVEL SECURITY;

-- Messaging / comms (message bodies, threads)
ALTER TABLE public.email_inbound            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_threads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_flow_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_space_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_channels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_dead_letters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_notification_prefs  ENABLE ROW LEVEL SECURITY;

-- Financial (pre-launch, but lock down before any data lands)
ALTER TABLE public.transaction_ledger       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_billing_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_products            ENABLE ROW LEVEL SECURITY;

-- Creator / community
ALTER TABLE public.creator_databases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_waitlist         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members        ENABLE ROW LEVEL SECURITY;

-- Analytics / misc
ALTER TABLE public.analytics_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_links              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pullups                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vectors                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_impersonation_log  ENABLE ROW LEVEL SECURITY;
