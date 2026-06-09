-- 075_ig_conversation_flow.sql
--
-- Conversational comment→DM flows. Instead of a comment auto-DM dropping the
-- link immediately, the host asks something first — a prompt ("Say LETS GO and
-- it's yours") or a question ("what's pulling you out to this?"). The guest has
-- to REPLY to get in, and that reply opens the 24h DM window (so the follow-up
-- never needs the un-approved Human Agent tag). Their answer is captured as a
-- signal on the person, and can optionally split the response two ways.
--
-- `event_comment_triggers.flow` (jsonb, nullable): a trigger WITHOUT a flow keeps
-- today's immediate-link behaviour; WITH a flow it runs the opener→reply→answer
-- exchange. Shape:
--   {
--     "opener":  "Before I send it — what's pulling you out to this?",
--     "capture": "what's pulling you out",            -- label for the Q→A signal (optional)
--     "split":   null | { "keyword": "solo, just me", "match": "contains" },
--     "answerA": { "text": "Perfect — here's your spot:", "includeLink": true },
--     "answerB": null | { "text": "...", "includeLink": true }
--   }
-- split null → any reply sends answerA (the gate/CTA case). split set → a reply
-- matching the keyword sends answerA, otherwise answerB.

alter table event_comment_triggers
  add column if not exists flow jsonb;

-- The "awaiting their reply" state. The opener went out as the comment's one
-- private reply; this row remembers we're mid-conversation so the next inbound
-- DM from this person is routed to the flow (branch + capture) instead of the
-- generic dm_keyword triggers. One-shot: the first reply completes it.
create table if not exists ig_flow_sessions (
  id                uuid primary key default gen_random_uuid(),
  host_profile_id   uuid not null,
  person_id         uuid not null,
  trigger_id        uuid,                 -- event_comment_triggers.id (analytics; flow is snapshotted below)
  event_id          uuid,
  event_slug        text,                 -- for building the signup link at answer time
  opener_comment_id text,
  flow              jsonb not null,       -- snapshot, so editing/deleting the trigger can't break an in-flight chat
  status            text not null default 'awaiting' check (status in ('awaiting','completed')),
  branch            text,                 -- 'A' | 'B' — which answer fired
  reply_text        text,                 -- what they actually wrote back
  created_at        timestamptz not null default now(),
  responded_at      timestamptz
);

-- The hot lookup: "is this person mid-flow with this host?"
create index if not exists ig_flow_sessions_await_idx
  on ig_flow_sessions (host_profile_id, person_id, status, created_at desc);
