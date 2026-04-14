-- Atomic RSVP insert with capacity check
-- Prevents race conditions by locking the event row during count + insert
CREATE OR REPLACE FUNCTION atomic_rsvp_insert(
  -- RSVP fields (DB column names)
  p_person_id UUID,
  p_event_id UUID,
  p_slug TEXT,
  p_booking_status TEXT,       -- 'CONFIRMED' | 'PENDING_PAYMENT' | 'WAITLIST'
  p_status TEXT,               -- 'attending' | 'waitlist' | 'cancelled'
  p_plus_ones INTEGER,
  p_party_size INTEGER,
  p_wants_dinner BOOLEAN,
  p_dinner JSONB,
  p_dinner_status TEXT,
  p_dinner_time_slot TEXT,
  p_dinner_party_size INTEGER,
  p_total_guests INTEGER,
  p_payment_id TEXT,
  p_payment_status TEXT,
  p_dinner_pull_up_count INTEGER,
  p_cocktail_only_pull_up_count INTEGER,
  p_pulled_up BOOLEAN,
  p_pulled_up_count INTEGER,
  p_pulled_up_for_dinner BOOLEAN,
  p_pulled_up_for_cocktails BOOLEAN,
  p_marketing_opt_in BOOLEAN,
  p_is_vip BOOLEAN,
  p_visitor_id TEXT,
  -- Capacity parameters (calculated by JS, passed in)
  p_cocktails_only_for_booking INTEGER,  -- how many cocktails-only spots this booking needs
  p_cocktail_capacity INTEGER,           -- event's cocktail_capacity (NULL = unlimited)
  p_dinner_max_seats INTEGER,            -- event's dinner_max_seats_per_slot (NULL = unlimited)
  p_dinner_slot_key TEXT,                -- normalized dinner time slot ISO string (NULL if no dinner)
  p_join_waitlist BOOLEAN DEFAULT FALSE, -- user explicitly opted into waitlist
  p_instant_waitlist BOOLEAN DEFAULT FALSE -- event has instant waitlist enabled
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  current_cocktails_only INTEGER;
  current_dinner_slot_count INTEGER;
  final_booking_status TEXT;
  final_status TEXT;
  final_dinner_status TEXT;
  final_dinner JSONB;
  capacity_exceeded BOOLEAN := FALSE;
  inserted_row RECORD;
BEGIN
  -- Lock the event row to serialize concurrent RSVPs
  PERFORM id FROM events WHERE id = p_event_id FOR UPDATE;

  -- If instant waitlist, skip capacity checks — everything goes to waitlist
  IF p_instant_waitlist THEN
    final_booking_status := 'WAITLIST';
    final_status := 'waitlist';
    final_dinner_status := CASE WHEN p_wants_dinner THEN 'waitlist' ELSE p_dinner_status END;
    final_dinner := CASE
      WHEN p_dinner IS NOT NULL AND p_wants_dinner THEN
        jsonb_set(p_dinner, '{bookingStatus}', '"WAITLIST"')
      ELSE p_dinner
    END;
  ELSE
    -- Check cocktail capacity
    IF p_cocktail_capacity IS NOT NULL THEN
      SELECT COALESCE(SUM(
        CASE
          WHEN (r.wants_dinner = TRUE OR (r.dinner IS NOT NULL AND (r.dinner->>'enabled')::boolean = TRUE))
          THEN COALESCE(r.plus_ones, 0)
          ELSE COALESCE(r.party_size, 1)
        END
      ), 0)
      INTO current_cocktails_only
      FROM rsvps r
      WHERE r.event_id = p_event_id
        AND r.booking_status IN ('CONFIRMED', 'PENDING_PAYMENT');

      IF current_cocktails_only + p_cocktails_only_for_booking > p_cocktail_capacity THEN
        capacity_exceeded := TRUE;
      END IF;
    END IF;

    -- Check dinner slot capacity
    IF NOT capacity_exceeded AND p_dinner_slot_key IS NOT NULL AND p_dinner_max_seats IS NOT NULL THEN
      SELECT COALESCE(SUM(COALESCE(r.dinner_party_size, 1)), 0)
      INTO current_dinner_slot_count
      FROM rsvps r
      WHERE r.event_id = p_event_id
        AND r.booking_status IN ('CONFIRMED', 'PENDING_PAYMENT')
        AND r.dinner_time_slot = p_dinner_slot_key
        AND (r.wants_dinner = TRUE OR (r.dinner IS NOT NULL AND (r.dinner->>'enabled')::boolean = TRUE));

      IF current_dinner_slot_count + COALESCE(p_dinner_party_size, 0) > p_dinner_max_seats THEN
        capacity_exceeded := TRUE;
      END IF;
    END IF;

    -- Determine final status
    IF capacity_exceeded THEN
      IF p_join_waitlist THEN
        final_booking_status := 'WAITLIST';
        final_status := 'waitlist';
        final_dinner_status := CASE WHEN p_wants_dinner THEN 'waitlist' ELSE p_dinner_status END;
        final_dinner := CASE
          WHEN p_dinner IS NOT NULL AND p_wants_dinner THEN
            jsonb_set(p_dinner, '{bookingStatus}', '"WAITLIST"')
          ELSE p_dinner
        END;
      ELSE
        -- User did NOT opt into waitlist — reject
        RETURN jsonb_build_object('rejected', TRUE, 'reason', 'capacity_exceeded');
      END IF;
    ELSE
      -- Capacity available — use the status determined by JS (CONFIRMED or PENDING_PAYMENT)
      final_booking_status := p_booking_status;
      final_status := p_status;
      final_dinner_status := p_dinner_status;
      final_dinner := p_dinner;
    END IF;
  END IF;

  -- Insert the RSVP
  INSERT INTO rsvps (
    person_id, event_id, slug, booking_status, status,
    plus_ones, party_size, wants_dinner, dinner, dinner_status,
    dinner_time_slot, dinner_party_size, total_guests,
    payment_id, payment_status,
    dinner_pull_up_count, cocktail_only_pull_up_count,
    pulled_up, pulled_up_count, pulled_up_for_dinner, pulled_up_for_cocktails,
    marketing_opt_in, is_vip, visitor_id
  ) VALUES (
    p_person_id, p_event_id, p_slug, final_booking_status, final_status,
    p_plus_ones, p_party_size, p_wants_dinner, final_dinner, final_dinner_status,
    p_dinner_time_slot, p_dinner_party_size, p_total_guests,
    p_payment_id, p_payment_status,
    p_dinner_pull_up_count, p_cocktail_only_pull_up_count,
    p_pulled_up, p_pulled_up_count, p_pulled_up_for_dinner, p_pulled_up_for_cocktails,
    p_marketing_opt_in, p_is_vip, p_visitor_id
  )
  RETURNING * INTO inserted_row;

  RETURN to_jsonb(inserted_row);
END;
$$;
