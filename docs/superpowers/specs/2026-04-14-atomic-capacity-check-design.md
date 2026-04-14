# Atomic Capacity Check & Explicit Waitlist Opt-In

**Date:** 2026-04-14
**Status:** Approved
**Event context:** "Hallon spritz lanseringsfest" at 270/300 — protecting against race conditions as capacity fills up

## Problem

The current RSVP flow has a race condition: capacity is checked in JS, then the RSVP is inserted in a separate DB call. Two concurrent requests can both read "299/300", both pass the check, and both insert — resulting in 301/300.

Worse, the user who lost the race gets silently waitlisted. They clicked "Register" expecting a spot, but end up on the waitlist with no choice in the matter.

## Solution

Two changes, one backend and one frontend:

1. **Atomic capacity check** — a Postgres function that locks the event row, counts capacity, and inserts the RSVP in a single transaction. Eliminates the race condition.
2. **Explicit waitlist opt-in** — if the event fills up between page load and submission, the user sees an inline message and chooses whether to join the waitlist. No silent waitlisting.

## Scope

This targets **one specific edge case**: the user loaded the page when spots were available, but the event filled before they submitted. If the frontend already shows "Join waitlist" (because it pre-checked capacity), the current flow is fine — the user already opted in.

## Design

### 1. Postgres Function: `atomic_rsvp_insert`

A PL/pgSQL function that replaces the current `supabase.from("rsvps").insert()` call.

**Inputs:** All current RSVP fields plus:
- `p_join_waitlist BOOLEAN DEFAULT false` — whether the user explicitly opted into the waitlist
- `p_cocktail_capacity INTEGER` — the event's cocktail capacity (passed in, not re-queried)
- `p_dinner_max_seats INTEGER` — dinner slot capacity (if applicable)
- `p_dinner_time_slot TEXT` — the dinner slot being booked (if applicable)

**Logic:**
```
BEGIN
  -- Lock the event row to serialize concurrent RSVPs
  SELECT id FROM events WHERE id = p_event_id FOR UPDATE;

  -- Count current confirmed + pending_payment guests (cocktails-only metric)
  -- Uses same calculation as existing getCocktailsOnlyCount()
  current_count := (count cocktails-only from rsvps where event_id and status in CONFIRMED/PENDING_PAYMENT);

  -- Check cocktail capacity
  IF current_count + p_cocktails_only_count > p_cocktail_capacity THEN
    IF p_join_waitlist THEN
      -- User opted in: insert as WAITLIST
      INSERT INTO rsvps (...) VALUES (..., 'WAITLIST', ...) RETURNING * INTO result;
      RETURN result;
    ELSE
      -- User did NOT opt in: reject, no row created
      RETURN NULL;
    END IF;
  END IF;

  -- Check dinner slot capacity (if applicable)
  IF p_dinner_time_slot IS NOT NULL AND p_dinner_max_seats IS NOT NULL THEN
    dinner_count := (count dinner guests in this slot);
    IF dinner_count + p_dinner_party_size > p_dinner_max_seats THEN
      IF p_join_waitlist THEN
        INSERT INTO rsvps (...) VALUES (..., 'WAITLIST', ...) RETURNING * INTO result;
        RETURN result;
      ELSE
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  -- Capacity available: insert as CONFIRMED (or PENDING_PAYMENT for paid events)
  INSERT INTO rsvps (...) VALUES (..., p_booking_status, ...) RETURNING * INTO result;
  RETURN result;
END
```

**Key property:** The `FOR UPDATE` lock on the event row serializes all concurrent RSVP attempts for the same event. One request completes its count + insert before the next one can read.

### 2. Backend API Change

**Endpoint:** `POST /events/:slug/rsvp`

**New request field:**
- `joinWaitlist: boolean` (optional, defaults to `false`)

**New error response:**
- `{ error: "capacity_exceeded" }` with HTTP 409
- Means: event is full, no RSVP was created, user did not opt into waitlist

**Behavior change in `addRsvp()`:**
- All business logic (person lookup, duplicate check, party size calc, dinner slot resolution) stays in JS — unchanged
- The final `supabase.from("rsvps").insert()` is replaced by `supabase.rpc("atomic_rsvp_insert", { ... })`
- If the function returns `NULL`: return `{ error: "capacity_exceeded" }`
- If it returns a row: proceed as normal (return event + rsvp)

**No change to:** duplicate handling, paid event flow, instant waitlist, or any existing response shapes.

### 3. Frontend: Inline "Event Full" State in RsvpForm

When the form submission gets back `capacity_exceeded` (409):

**What happens:**
1. The form area transitions to a new inline state (no redirect, no navigation)
2. Displays:
   - Heading: **"This event just filled up"**
   - Subtext: "A spot was taken while you were registering. Want to join the waitlist? We'll reach out if a spot opens up."
   - **"Join waitlist"** button (amber/orange style, matching existing waitlist button)
   - "Go back" text link to return to normal form state
3. All form data stays in React state — no re-entry needed

**When user clicks "Join waitlist":**
- Resubmits the exact same form data with `joinWaitlist: true`
- Backend creates WAITLIST rsvp via the atomic function
- Redirects to success page showing waitlist status (existing flow, unchanged)

**When user clicks "Go back":**
- Form returns to its normal state with all fields pre-filled
- User can modify their details if they want

**Styling:** Matches existing waitlist warning banner style (amber background, clear messaging). Consistent with the current dark UI + gold accents theme.

## What Does NOT Change

- The happy path (capacity available) — identical behavior, just race-proof now
- The pre-checked waitlist flow (frontend already shows "Join waitlist") — unchanged
- Success page, confirmation emails, admin dashboard — all unchanged
- Existing RSVPs, database schema (only adding a function) — no migration risk
- `instantWaitlist` events — still auto-waitlist everyone, bypass capacity check
- Paid event payment flow — PENDING_PAYMENT still holds spots as before

## Edge Cases

| Scenario | Behavior |
|---|---|
| Event full, user submits without `joinWaitlist` | Returns `capacity_exceeded`, no RSVP created |
| Event full, user clicks "Join waitlist" (`joinWaitlist: true`) | Creates WAITLIST RSVP |
| Two concurrent requests, 1 spot left | First gets CONFIRMED, second gets `capacity_exceeded` (atomic) |
| Frontend pre-check already showed "Join waitlist" | Submits with `joinWaitlist: true` from the start — no change needed |
| `instantWaitlist` enabled | All RSVPs go to WAITLIST regardless — no capacity check needed, existing logic handles this |
| Paid event at capacity boundary | Same atomic check; PENDING_PAYMENT counts toward capacity as before |
| Party of 3 at 299/300 | Entire party gets `capacity_exceeded` (all-or-nothing preserved) |
