-- 077_enrichment_questions.sql
--
-- Host-authored "enrichment" questions on an event's RSVP form.
--
-- These are NOT identity. The four anchors (Name / Email / WhatsApp / Instagram)
-- stay sacred and untouched. Enrichment is a separate block a host can add below
-- them — free-text prompts they write themselves ("Allergies?", "Which restaurant
-- are you from?"). Jägermeister asked for exactly this.
--
-- Shape: an array of question objects on the event.
--   [{ id: "q_ab12", label: "Allergies?", required: false }, ...]
--
-- The ANSWERS already have a home: each RSVP's existing rsvps.custom_answers JSONB
-- (mig 018) keyed by question id. addRsvp's splitCustomAnswers routes non-identity
-- answers there automatically, so no RSVP-side change is needed. The person card
-- aggregates a person's answers across every event they've ever filled in.
--
-- Additive + idempotent.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS enrichment_questions JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN events.enrichment_questions IS
  'Host-authored free-text RSVP questions: [{id,label,required}]. Answers live per-RSVP in rsvps.custom_answers keyed by question id.';
