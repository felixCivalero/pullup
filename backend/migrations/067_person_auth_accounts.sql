-- 067_person_auth_accounts.sql
--
-- ACCOUNT LINKING — many login accounts → one human.
--
-- PullUp has three ways in (email magic-link, WhatsApp OTP, Google), so one
-- person routinely ends up with several Supabase auth accounts — e.g. they sign
-- up once with a personal Gmail, once with a bookings address, once via Google.
-- Today `people.auth_user_id` is a single column: one auth account per person,
-- the rest fragment into separate rows + separate Rooms.
--
-- This adds a many-to-one map (many auth_user_ids → one person) WITHOUT changing
-- the existing path: `people.auth_user_id` stays the PRIMARY login and every
-- current read resolves exactly as before. This table holds the primary (back-
-- filled) PLUS any linked secondaries. Resolution becomes column-first, then
-- table-fallback — so only newly-linked accounts gain resolution; nothing that
-- works today changes. The person is the atom; logins are just doors into it.
-- See [[architecture_auth_identity]], [[project_the_room_is_pullup]].

BEGIN;

CREATE TABLE IF NOT EXISTS person_auth_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,             -- a Supabase auth.users id
  method       TEXT,                       -- 'email' | 'whatsapp' | 'google' | 'primary' | 'merged' | 'manual'
  email        TEXT,                       -- the address/identifier of THIS auth account (display)
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  linked_by    UUID,                       -- admin who linked it (null = backfill/system)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An auth account belongs to exactly ONE person — no ambiguity on login.
  UNIQUE (auth_user_id)
);
CREATE INDEX IF NOT EXISTS idx_paa_person ON person_auth_accounts (person_id);

COMMENT ON TABLE person_auth_accounts IS
  'Many login accounts → one person. people.auth_user_id stays the PRIMARY; this holds primary (backfilled) + linked secondaries. Resolution = column first, then this table.';

-- Backfill: every person who has a login becomes a primary row here.
INSERT INTO person_auth_accounts (person_id, auth_user_id, method, email, is_primary)
SELECT id, auth_user_id, 'primary', email, TRUE
FROM people
WHERE auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO NOTHING;

-- Teach the merge to PRESERVE the absorbed person's login: instead of orphaning
-- their auth account (the old behaviour), record it as a secondary login of the
-- canonical person, and repoint any secondaries they already carried. Both
-- Supabase auth users stay alive — only the person rows collapse.
CREATE OR REPLACE FUNCTION admin_merge_people(
  p_canonical UUID, p_merged UUID, p_actor UUID DEFAULT NULL, p_candidate UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_snapshot JSONB;
  v_review_id UUID;
BEGIN
  IF p_canonical IS NULL OR p_merged IS NULL THEN
    RAISE EXCEPTION 'admin_merge_people: both person ids required';
  END IF;
  IF p_canonical = p_merged THEN
    RAISE EXCEPTION 'admin_merge_people: cannot merge a person into themselves';
  END IF;

  SELECT to_jsonb(pp.*) INTO v_snapshot FROM people pp WHERE pp.id = p_merged;
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'admin_merge_people: merged person % not found', p_merged;
  END IF;

  DELETE FROM person_source_profiles m
    WHERE m.person_id = p_merged
      AND EXISTS (SELECT 1 FROM person_source_profiles c WHERE c.person_id = p_canonical AND c.source = m.source);
  UPDATE person_source_profiles SET person_id = p_canonical WHERE person_id = p_merged;

  DELETE FROM pullups m
    WHERE m.person_id = p_merged
      AND EXISTS (SELECT 1 FROM pullups c WHERE c.person_id = p_canonical AND c.event_id = m.event_id);
  UPDATE pullups SET person_id = p_canonical WHERE person_id = p_merged;

  DELETE FROM instagram_threads m
    WHERE m.person_id = p_merged
      AND EXISTS (SELECT 1 FROM instagram_threads c WHERE c.person_id = p_canonical AND c.host_profile_id = m.host_profile_id);
  UPDATE instagram_threads SET person_id = p_canonical WHERE person_id = p_merged;

  DELETE FROM whatsapp_threads m
    WHERE m.person_id = p_merged
      AND EXISTS (SELECT 1 FROM whatsapp_threads c WHERE c.person_id = p_canonical AND c.host_profile_id = m.host_profile_id);
  UPDATE whatsapp_threads SET person_id = p_canonical WHERE person_id = p_merged;

  UPDATE person_identities SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE person_events        SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE person_notes         SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE rsvps                SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE whatsapp_outbox      SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE magic_link_tokens    SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE phone_opt_ins        SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE email_inbound        SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE email_outbox         SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE message_dead_letters SET person_id = p_canonical WHERE person_id = p_merged;
  UPDATE event_space_messages SET author_person_id = p_canonical WHERE author_person_id = p_merged;

  DELETE FROM person_match_candidates WHERE person_a = p_merged OR person_b = p_merged;

  -- Preserve the merged login as a secondary of the canonical (don't orphan it).
  INSERT INTO person_auth_accounts (person_id, auth_user_id, method, email, is_primary)
  SELECT p_canonical, m.auth_user_id, 'merged', m.email, FALSE
  FROM people m WHERE m.id = p_merged AND m.auth_user_id IS NOT NULL
  ON CONFLICT (auth_user_id) DO UPDATE
    SET person_id = p_canonical, is_primary = FALSE, method = 'merged';  -- demote: canonical keeps its one primary
  -- Repoint any secondaries the merged person already carried (before cascade).
  UPDATE person_auth_accounts SET person_id = p_canonical WHERE person_id = p_merged;

  INSERT INTO person_merges (canonical_person_id, merged_person_id, merged_by, reason, snapshot)
  VALUES (p_canonical, p_merged, p_actor, 'admin_manual', v_snapshot);

  INSERT INTO match_reviews (actor_id, action, person_id, target_person_id, candidate_id, detail)
  VALUES (p_actor, 'merge', p_canonical, p_merged, p_candidate, jsonb_build_object('merged_snapshot', v_snapshot))
  RETURNING id INTO v_review_id;

  IF p_candidate IS NOT NULL THEN
    UPDATE person_match_candidates SET status='confirmed', resolved_by=p_actor, resolved_at=now() WHERE id=p_candidate;
  END IF;

  DELETE FROM people WHERE id = p_merged;
  RETURN jsonb_build_object('ok', true, 'canonicalId', p_canonical, 'mergedId', p_merged, 'reviewId', v_review_id);
END;
$$;

COMMIT;
