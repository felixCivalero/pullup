-- Admin "Act as" audit log. Every time a superuser steps into a host's account
-- (full session-swap impersonation), we record WHO did it, WHO they acted as,
-- and the window. This is the "you operating as Adam, not being Adam" guarantee:
-- the real admin id is preserved even though req.user becomes the host for the
-- duration. See middleware/auth.js applyActAs() + routes/adminImpersonation.js.
create table if not exists admin_impersonation_log (
  id uuid primary key default gen_random_uuid(),
  real_user_id uuid not null,          -- the admin who initiated (the real you)
  acting_as_user_id uuid not null,     -- the host account being operated
  acting_as_email text,                -- denormalised for readable audit
  started_at timestamptz not null default now(),
  ended_at timestamptz                 -- null while the session is live
);

create index if not exists idx_impersonation_real
  on admin_impersonation_log (real_user_id, started_at desc);
