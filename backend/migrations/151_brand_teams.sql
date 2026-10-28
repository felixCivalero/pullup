-- 151: working together. A brand has a head (the account that owns it,
-- brands.host_id) and members the head invites: they work in the brand like
-- the head does (events, guests, CRM, mail on the head's credits). One event
-- can also be shared on its own, as before (event_hosts, the old app's
-- co-hosts, still honoured). An invite is to an email address; the person
-- signs in with that address and says yes (lib/teams.js).

CREATE TABLE IF NOT EXISTS brand_members (
  brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_brand_members_user ON brand_members(user_id);

-- One open invite per address and brand (or event). Accepting or declining
-- deletes it; one older than 30 days no longer counts.
CREATE TABLE IF NOT EXISTS team_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID REFERENCES brands(id) ON DELETE CASCADE,
  event_id   UUID REFERENCES events(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_invites_one_target CHECK ((brand_id IS NULL) <> (event_id IS NULL)),
  CONSTRAINT team_invites_email CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_invites_brand ON team_invites(brand_id, email) WHERE brand_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_invites_event ON team_invites(event_id, email) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_invites_email ON team_invites(email);
CREATE INDEX IF NOT EXISTS idx_event_hosts_user ON event_hosts(user_id);

-- Who in the team sent a mail (an event's co-host sees only their own sends).
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Only the API (service role) reads or writes these.
ALTER TABLE brand_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_members, team_invites FROM anon, authenticated, PUBLIC;
GRANT ALL ON brand_members, team_invites TO service_role;
