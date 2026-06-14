-- 089_creator_waitlist.sql
--
-- Creator sign-up waitlist. With BYO-Supabase, the landing page no longer
-- self-serves account creation — new creators (and agencies) join a waitlist
-- and we onboard them by hand (concierge setup). This is the capture table.
--
-- Distinct from the EVENT waitlist (rsvps.booking_status = 'WAITLIST'); that's
-- guests waiting on a full room. This is people waiting to get onto PullUp.

create table if not exists creator_waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  -- 'creator' (solo) | 'agency' (manages multiple creators)
  role        text not null default 'creator',
  -- IG handle, website, or however they want to be found
  handle      text,
  -- free text: what they make / who they manage / anything they want us to know
  note        text,
  -- where the signup came from (landing CTA location, referrer, etc.)
  source      text,
  -- pending → invited (we reached out) → joined (account created)
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  invited_at  timestamptz,
  joined_at   timestamptz
);

-- One row per email; a re-submit refreshes details instead of duplicating.
-- Emails are normalized to lowercase before insert (services/account.js
-- normalizeEmail), so a plain unique index on the column is case-safe AND
-- usable as an ON CONFLICT target for the upsert in routes/waitlist.js.
create unique index if not exists creator_waitlist_email_uniq
  on creator_waitlist (email);

create index if not exists creator_waitlist_status_idx
  on creator_waitlist (status, created_at desc);
