-- 091_community_cover.sql
--
-- Give a community a cover image so its public page (/c/:slug) reads like an
-- event page — a branded hero, not just text. Stored as a URL (signed
-- direct-to-Supabase upload, same as event covers).
alter table communities add column if not exists cover_image_url text;
