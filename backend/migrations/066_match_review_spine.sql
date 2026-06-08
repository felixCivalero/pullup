-- 066_match_review_spine.sql
--
-- ADMIN MATCH REVIEW — the human-in-the-loop cockpit over identity resolution.
--
-- The resolver (personResolution.js) was built to NEVER auto-merge an ambiguous
-- match: verified identifiers link, typed handles are soft claims, collisions
-- get queued in person_match_candidates and walked away from. That deferral was
-- always meant to land in front of a human. This migration gives the human the
-- tools to act on it:
--
--   * person_identities.reviewed_at / reviewed_by — an admin eyeballed this link
--     and confirmed it's really the same person. Distinct from verified_at
--     (which means an interaction/crypto proof); reviewed_at means "a human
--     looked at all the parameters and signed off".
--   * match_reviews — append-only audit of EVERY admin decision (confirm / edit /
--     split / merge / reject), with before/after snapshots so nothing is opaque
--     and merges stay explainable + reversible.
--   * admin_merge_people() — collision-safe, atomic fusion of two people. Repoints
--     every person_id FK in the schema, dedupes the four person-scoped unique
--     tables, snapshots the absorbed row into person_merges (for unmerge), and
--     deletes the merged row. One statement = one transaction.
--   * admin_split_identity() — the inverse-of-a-bad-link: peel one identifier off
--     a person onto a fresh person. The verification fix for "this handle isn't
--     actually them".
--
-- Purely additive. Nothing existing reads differently until the admin acts.
-- See [[project_external_data_system]], [[project_the_room_is_pullup]].

BEGIN;

-- ── 1. Human-review marks on the link itself ────────────────────────
ALTER TABLE person_identities
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;

COMMENT ON COLUMN person_identities.reviewed_at IS
  'When an admin manually confirmed this link is really the same human (distinct from verified_at = interaction/crypto proof).';

-- ── 2. Audit log of every admin match decision ──────────────────────
CREATE TABLE IF NOT EXISTS match_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id         UUID,                       -- admin who acted (null = system)
  action           TEXT NOT NULL,              -- confirm_link | edit_params | split | merge | reject_candidate | unmerge
  person_id        UUID,                        -- the subject person
  target_person_id UUID,                        -- merged-away / split-off person, when relevant
  candidate_id     UUID,                        -- person_match_candidates row, when relevant
  detail           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- before/after snapshot, reasons, field diffs
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE match_reviews
  DROP CONSTRAINT IF EXISTS match_reviews_action_enum;
ALTER TABLE match_reviews
  ADD  CONSTRAINT match_reviews_action_enum
  CHECK (action IN ('confirm_link','edit_params','split','merge','reject_candidate','unmerge'));

CREATE INDEX IF NOT EXISTS idx_match_reviews_person ON match_reviews (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_reviews_time   ON match_reviews (created_at DESC);

COMMENT ON TABLE match_reviews IS
  'Append-only audit of admin identity-match decisions. Every confirm/edit/split/merge/reject is recorded with a snapshot so the cockpit is fully accountable and reversible.';

-- ── 3. admin_merge_people() — atomic, collision-safe fusion ─────────
-- Absorbs p_merged INTO p_canonical. Repoints every person_id reference,
-- dedupes the person-scoped unique tables (keep canonical's row, drop the
-- merged duplicate), snapshots the absorbed person row into person_merges,
-- logs to match_reviews, then deletes the merged person. Returns a json summary.
CREATE OR REPLACE FUNCTION admin_merge_people(
  p_canonical UUID,
  p_merged    UUID,
  p_actor     UUID DEFAULT NULL,
  p_candidate UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
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

  -- Snapshot the row we are absorbing (reversibility lives here).
  SELECT to_jsonb(pp.*) INTO v_snapshot FROM people pp WHERE pp.id = p_merged;
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'admin_merge_people: merged person % not found', p_merged;
  END IF;

  -- 3a. Person-scoped UNIQUE tables: drop the merged row where canonical
  --     already occupies the (person, scope) slot, then repoint the rest.
  DELETE FROM person_source_profiles m
    WHERE m.person_id = p_merged
      AND EXISTS (SELECT 1 FROM person_source_profiles c
                  WHERE c.person_id = p_canonical AND c.source = m.source);
  UPDATE person_source_profiles SET person_id = p_canonical WHERE person_id = p_merged;

  DELETE FROM pullups m
    WHERE m.person_id = p_merged
      AND EXISTS (SELECT 1 FROM pullups c
                  WHERE c.person_id = p_canonical AND c.event_id = m.event_id);
  UPDATE pullups SET person_id = p_canonical WHERE person_id = p_merged;

  DELETE FROM instagram_threads m
    WHERE m.person_id = p_merged
      AND EXISTS (SELECT 1 FROM instagram_threads c
                  WHERE c.person_id = p_canonical AND c.host_profile_id = m.host_profile_id);
  UPDATE instagram_threads SET person_id = p_canonical WHERE person_id = p_merged;

  DELETE FROM whatsapp_threads m
    WHERE m.person_id = p_merged
      AND EXISTS (SELECT 1 FROM whatsapp_threads c
                  WHERE c.person_id = p_canonical AND c.host_profile_id = m.host_profile_id);
  UPDATE whatsapp_threads SET person_id = p_canonical WHERE person_id = p_merged;

  -- 3b. person_identities: UNIQUE is global on (kind,value_norm); two distinct
  --     people never share a value_norm, so a plain repoint can't collide.
  UPDATE person_identities SET person_id = p_canonical WHERE person_id = p_merged;

  -- 3c. Simple repoints (no person-scoped unique constraint).
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
  -- (person_vector_input is a VIEW over the base tables above — nothing to repoint.)

  -- 3d. Match candidates: merged person is going away — clear any pair it's in.
  DELETE FROM person_match_candidates WHERE person_a = p_merged OR person_b = p_merged;

  -- 3e. Audit trail (person_merges = reversibility; match_reviews = cockpit log).
  INSERT INTO person_merges (canonical_person_id, merged_person_id, merged_by, reason, snapshot)
  VALUES (p_canonical, p_merged, p_actor, 'admin_manual', v_snapshot);

  INSERT INTO match_reviews (actor_id, action, person_id, target_person_id, candidate_id, detail)
  VALUES (p_actor, 'merge', p_canonical, p_merged, p_candidate,
          jsonb_build_object('merged_snapshot', v_snapshot))
  RETURNING id INTO v_review_id;

  IF p_candidate IS NOT NULL THEN
    UPDATE person_match_candidates
      SET status = 'confirmed', resolved_by = p_actor, resolved_at = now()
      WHERE id = p_candidate;
  END IF;

  -- 3f. Finally drop the absorbed person.
  DELETE FROM people WHERE id = p_merged;

  RETURN jsonb_build_object(
    'ok', true,
    'canonicalId', p_canonical,
    'mergedId', p_merged,
    'reviewId', v_review_id
  );
END;
$$;

COMMENT ON FUNCTION admin_merge_people(UUID,UUID,UUID,UUID) IS
  'Atomically absorb p_merged into p_canonical: repoints all person_id FKs, dedupes person-scoped unique tables, snapshots to person_merges, logs to match_reviews, deletes merged person.';

-- ── 4. admin_split_identity() — peel one identifier onto a fresh person ──
-- The verification fix for a wrong soft-claim ("this @handle isn't actually
-- this human"). Moves ONLY the identity link to a brand-new person; timeline,
-- source profiles and other identifiers stay put. Returns the new person id.
CREATE OR REPLACE FUNCTION admin_split_identity(
  p_identity_id UUID,
  p_actor       UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_person  UUID;
  v_kind        TEXT;
  v_value       TEXT;
  v_new_person  UUID;
  v_name        TEXT;
  v_remaining   INT;
BEGIN
  SELECT person_id, kind, value INTO v_old_person, v_kind, v_value
    FROM person_identities WHERE id = p_identity_id;
  IF v_old_person IS NULL THEN
    RAISE EXCEPTION 'admin_split_identity: identity % not found', p_identity_id;
  END IF;

  -- Don't strand a person with zero identifiers.
  SELECT count(*) INTO v_remaining FROM person_identities WHERE person_id = v_old_person;
  IF v_remaining <= 1 THEN
    RAISE EXCEPTION 'admin_split_identity: this is the person''s only identifier — nothing to split off';
  END IF;

  -- Seed the new person's name from the identifier when it reads like one.
  v_name := CASE WHEN v_kind IN ('ig_handle','tiktok','twitter') THEN '@' || v_value
                 WHEN v_kind = 'email' THEN split_part(v_value, '@', 1)
                 ELSE NULL END;

  INSERT INTO people (name, instagram, email)
  VALUES (
    v_name,
    CASE WHEN v_kind = 'ig_handle' THEN v_value END,
    CASE WHEN v_kind = 'email' THEN v_value END
  )
  RETURNING id INTO v_new_person;

  UPDATE person_identities
    SET person_id = v_new_person, reviewed_at = NULL, reviewed_by = NULL
    WHERE id = p_identity_id;

  INSERT INTO match_reviews (actor_id, action, person_id, target_person_id, detail)
  VALUES (p_actor, 'split', v_old_person, v_new_person,
          jsonb_build_object('identity_id', p_identity_id, 'kind', v_kind, 'value', v_value));

  RETURN jsonb_build_object(
    'ok', true,
    'fromPerson', v_old_person,
    'newPerson', v_new_person,
    'kind', v_kind,
    'value', v_value
  );
END;
$$;

COMMENT ON FUNCTION admin_split_identity(UUID,UUID) IS
  'Peel one person_identities row off its person onto a brand-new person. The undo for a wrong soft-claim link.';

COMMIT;
