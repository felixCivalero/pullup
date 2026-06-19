-- 111_advisor_hardening_views_functions.sql
-- 2026-06-19 SECURITY: clear Supabase advisor ERROR/WARN findings.
--
-- (1) 4 views were SECURITY DEFINER (the default), so they ran with the
--     owner's privileges and bypassed RLS. security_invoker=true makes them
--     run as the caller. Backend reads via service role (bypasses RLS anyway),
--     so app behavior is unchanged; the anon/authenticated bypass closes.
-- (2) 8 functions had a role-mutable search_path. All are SECURITY INVOKER and
--     reference public tables; pinning to public removes the attack surface
--     without changing resolution.
--
-- ALREADY APPLIED TO PROD via Supabase MCP (migrations
-- "security_invoker_vector_views" + "pin_function_search_path").
-- Idempotent: safe to re-run.

-- (1) views -> security invoker
alter view public.event_vector_input  set (security_invoker = true);
alter view public.event_hosts_all      set (security_invoker = true);
alter view public.person_vector_input  set (security_invoker = true);
alter view public.host_vector_input    set (security_invoker = true);

-- (2) functions -> pinned search_path
alter function public.set_phone_opt_ins_updated_at() set search_path = public, pg_temp;
alter function public.set_whatsapp_updated_at() set search_path = public, pg_temp;
alter function public.admin_merge_people(uuid, uuid, uuid, uuid) set search_path = public, pg_temp;
alter function public.admin_split_identity(uuid, uuid) set search_path = public, pg_temp;
alter function public.bump_short_link(text) set search_path = public, pg_temp;
alter function public.upsert_whatsapp_thread(uuid, uuid, text, text, text, uuid, timestamptz) set search_path = public, pg_temp;
alter function public.pullup_host_world_people_count(uuid) set search_path = public, pg_temp;
alter function public.pullup_host_world_person_ids(uuid, integer) set search_path = public, pg_temp;
