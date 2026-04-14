# Atomic Capacity Check & Explicit Waitlist Opt-In — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the RSVP race condition with an atomic Postgres function, and give users an explicit choice to join the waitlist when the event fills up during their submission.

**Architecture:** A Postgres function `atomic_rsvp_insert` replaces the current `supabase.from("rsvps").insert()` call. It locks the event row, counts capacity, and inserts atomically. The backend `addRsvp()` passes a new `joinWaitlist` flag through. The frontend RsvpForm gets a new inline "capacity exceeded" state that lets users choose to join the waitlist.

**Tech Stack:** PostgreSQL (PL/pgSQL function), Express backend (data.js, index.js), React frontend (RsvpForm.jsx, EventPage.jsx)

---

### Task 1: Create the `atomic_rsvp_insert` Postgres Function

**Files:**
- Create: `backend/migrations/012_atomic_rsvp_insert.sql`

This function receives all RSVP column values plus capacity parameters. It locks the event row, counts current guests, and either inserts or rejects.

- [ ] **Step 1: Write the migration SQL**

Create `backend/migrations/012_atomic_rsvp_insert.sql`:

```sql
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
```

- [ ] **Step 2: Apply the migration to Supabase**

Run via Supabase MCP `apply_migration` or execute the SQL directly:
```bash
# Or apply via supabase CLI:
cd /Users/felixcivalero/Projects/pullup/backend
# The migration file is ready — apply it via the Supabase dashboard or MCP tool
```

- [ ] **Step 3: Verify the function exists**

Run this SQL to confirm:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'atomic_rsvp_insert' AND routine_schema = 'public';
```
Expected: one row with `atomic_rsvp_insert`

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/012_atomic_rsvp_insert.sql
git commit -m "feat: add atomic_rsvp_insert Postgres function for race-proof capacity checks"
```

---

### Task 2: Update `addRsvp()` to Use the Atomic Function

**Files:**
- Modify: `backend/src/data.js:2515-2810` (the `addRsvp` function)

The function signature gets a new `joinWaitlist` param. The capacity-check JS code (lines 2592-2723) stays for now as a pre-check (fast rejection without DB lock), but the actual insert uses the atomic function. If the atomic function rejects, return a new `capacity_exceeded` error.

- [ ] **Step 1: Add `joinWaitlist` to the function signature**

In `backend/src/data.js`, modify the `addRsvp` function signature at line 2515:

```javascript
export async function addRsvp({
  slug,
  name,
  email,
  plusOnes = 0,
  wantsDinner = false,
  dinnerTimeSlot = null,
  dinnerPartySize = null,
  marketingOptIn = false,
  isVip = false,
  visitorId = null,
  joinWaitlist = false,
}) {
```

- [ ] **Step 2: Pass `joinWaitlist` into the capacity decision logic**

At line 2714 in `backend/src/data.js`, modify the booking status logic to NOT silently waitlist when `joinWaitlist` is false and the frontend thought there was capacity. Replace lines 2714-2723:

```javascript
  // ALL-OR-NOTHING: Set bookingStatus based on BOTH capacity checks
  let bookingStatus = "CONFIRMED";
  if (event.instantWaitlist) {
    bookingStatus = "WAITLIST";
  } else if (!cocktailCapacityOk || !dinnerCapacityOk) {
    if (event.waitlistEnabled && joinWaitlist) {
      // User explicitly opted into waitlist (frontend pre-check showed waitlist)
      bookingStatus = "WAITLIST";
    } else if (event.waitlistEnabled) {
      // Capacity exceeded but user didn't opt in — will be caught by atomic function
      // Set to CONFIRMED here; the atomic function will make the final call
      bookingStatus = "CONFIRMED";
    } else {
      return { error: "full", event };
    }
  }
```

- [ ] **Step 3: Replace the insert call with the atomic function**

In `backend/src/data.js`, replace lines 2793-2805 (the `mapRsvpToDb` + `supabase.from("rsvps").insert()` block):

```javascript
  const dbRsvpData = mapRsvpToDb(rsvpData);

  // Use atomic function for race-proof capacity check + insert
  const { data: atomicResult, error: rpcError } = await supabase.rpc(
    "atomic_rsvp_insert",
    {
      p_person_id: dbRsvpData.person_id,
      p_event_id: dbRsvpData.event_id,
      p_slug: dbRsvpData.slug,
      p_booking_status: dbRsvpData.booking_status,
      p_status: dbRsvpData.status,
      p_plus_ones: dbRsvpData.plus_ones ?? 0,
      p_party_size: dbRsvpData.party_size ?? 1,
      p_wants_dinner: dbRsvpData.wants_dinner ?? false,
      p_dinner: dbRsvpData.dinner ?? null,
      p_dinner_status: dbRsvpData.dinner_status ?? null,
      p_dinner_time_slot: dbRsvpData.dinner_time_slot ?? null,
      p_dinner_party_size: dbRsvpData.dinner_party_size ?? null,
      p_total_guests: dbRsvpData.total_guests ?? dbRsvpData.party_size ?? 1,
      p_payment_id: dbRsvpData.payment_id ?? null,
      p_payment_status: dbRsvpData.payment_status ?? null,
      p_dinner_pull_up_count: dbRsvpData.dinner_pull_up_count ?? 0,
      p_cocktail_only_pull_up_count: dbRsvpData.cocktail_only_pull_up_count ?? 0,
      p_pulled_up: dbRsvpData.pulled_up ?? false,
      p_pulled_up_count: dbRsvpData.pulled_up_count ?? null,
      p_pulled_up_for_dinner: dbRsvpData.pulled_up_for_dinner ?? false,
      p_pulled_up_for_cocktails: dbRsvpData.pulled_up_for_cocktails ?? false,
      p_marketing_opt_in: dbRsvpData.marketing_opt_in ?? false,
      p_is_vip: dbRsvpData.is_vip ?? false,
      p_visitor_id: dbRsvpData.visitor_id ?? null,
      // Capacity params
      p_cocktails_only_for_booking: cocktailsOnlyForThisBooking,
      p_cocktail_capacity: event.cocktailCapacity ?? null,
      p_dinner_max_seats: event.dinnerMaxSeatsPerSlot ?? null,
      p_dinner_slot_key: finalDinnerTimeSlot ?? null,
      p_join_waitlist: joinWaitlist || (willGoToWaitlist && event.waitlistEnabled),
      p_instant_waitlist: !!event.instantWaitlist,
    }
  );

  if (rpcError) {
    console.error("Error in atomic RSVP insert:", rpcError);
    return { error: "database_error", message: rpcError.message };
  }

  // Check if the atomic function rejected the insert (capacity exceeded, user didn't opt in)
  if (atomicResult && atomicResult.rejected) {
    return { error: "capacity_exceeded", event };
  }

  const rsvp = mapRsvpFromDb(atomicResult, person);

  return { event, rsvp };
```

Note: We need to compute `willGoToWaitlist` from the JS-side pre-check so we can pass it to the function. Add this line right before the `mapRsvpToDb` call:

```javascript
  const willGoToWaitlist = !cocktailCapacityOk || !dinnerCapacityOk;
```

- [ ] **Step 4: Verify `cocktailsOnlyForThisBooking` is accessible at the insert point**

Check that the variable `cocktailsOnlyForThisBooking` (calculated at line 2598) is still in scope at the insert point (line ~2793). It is — both are in the same `addRsvp` function body. No change needed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/data.js
git commit -m "feat: use atomic_rsvp_insert in addRsvp() for race-proof capacity checks"
```

---

### Task 3: Add `capacity_exceeded` Error Handling to the API Route

**Files:**
- Modify: `backend/src/index.js:1640-1655` (rsvpData construction)
- Modify: `backend/src/index.js:2086-2091` (error handling)

- [ ] **Step 1: Pass `joinWaitlist` from request body to `addRsvp()`**

In `backend/src/index.js`, find the rsvpData construction around line 1642. Add `joinWaitlist` to the object. Modify the non-waitlist-upgrade branch (line 1642-1653):

```javascript
    : {
        slug,
        name,
        email: effectiveEmail,
        plusOnes,
        wantsDinner,
        dinnerTimeSlot,
        dinnerPartySize,
        marketingOptIn: marketingOptIn || false,
        isVip: !!vipInvite,
        visitorId: visitorId || null,
        joinWaitlist: !!req.body.joinWaitlist,
      };
```

- [ ] **Step 2: Add `capacity_exceeded` error response**

In `backend/src/index.js`, after the existing "full" error handler at line 2091, add:

```javascript
    if (result.error === "capacity_exceeded") {
      return res.status(409).json({
        error: "capacity_exceeded",
        event: result.event,
      });
    }
```

- [ ] **Step 3: Extract `joinWaitlist` from request body destructuring**

Find where the route handler destructures `req.body` (around line 1449+). Add `joinWaitlist` to the destructured fields. Look for the line like:

```javascript
    const { name, email, plusOnes, wantsDinner, dinnerTimeSlot, dinnerPartySize, ... } = req.body;
```

Add `joinWaitlist` to it.

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.js
git commit -m "feat: handle joinWaitlist param and capacity_exceeded error in RSVP route"
```

---

### Task 4: Add "Event Full" Inline State to RsvpForm

**Files:**
- Modify: `frontend/src/components/RsvpForm.jsx`

- [ ] **Step 1: Add state for capacity exceeded**

Near the top of the RsvpForm component (around line 50, near other `useState` calls), add:

```javascript
  const [capacityExceeded, setCapacityExceeded] = useState(false);
```

- [ ] **Step 2: Detect `capacity_exceeded` in handleSubmit**

In RsvpForm.jsx, the `handleSubmit` function calls `onSubmit()` and checks `result.error` at line 213. But the error message comes back as a string from EventPage.jsx's `handleRsvpSubmit`. We need to change EventPage.jsx to return a structured object for this case. For now, modify the error check in RsvpForm.jsx at lines 212-215:

```javascript
        if (result && result.error) {
          if (result.capacityExceeded) {
            setCapacityExceeded(true);
            setError("");
          } else {
            setError(result.error);
          }
        }
```

- [ ] **Step 3: Render the "event just filled up" inline state**

In RsvpForm.jsx, right before the waitlist notice (line 657), add the capacity exceeded state. When `capacityExceeded` is true, render this instead of the normal form controls:

```jsx
      {/* Capacity exceeded — event filled during submission */}
      {capacityExceeded && (
        <div style={{
          padding: "20px",
          borderRadius: "8px",
          background: "rgba(245, 158, 11, 0.06)",
          border: "1px solid rgba(245, 158, 11, 0.15)",
          marginBottom: "16px",
          textAlign: "center",
        }}>
          <div style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "#fbbf24",
            marginBottom: "8px",
          }}>
            This event just filled up
          </div>
          <div style={{
            fontSize: "13px",
            color: "rgba(255, 255, 255, 0.6)",
            marginBottom: "20px",
            lineHeight: "1.5",
          }}>
            A spot was taken while you were registering. Want to join the waitlist? We'll reach out if a spot opens up.
          </div>
          <button
            type="button"
            onClick={() => {
              setCapacityExceeded(false);
              if (onSubmit) {
                onSubmit({
                  email: email.trim(),
                  name: name.trim() || null,
                  plusOnes: cocktailGuests,
                  wantsDinner,
                  dinnerTimeSlot: wantsDinner ? dinnerTimeSlot : null,
                  dinnerPartySize: wantsDinner ? dinnerSeats : null,
                  marketingOptIn,
                  joinWaitlist: true,
                });
              }
            }}
            style={{
              ...submitButtonStyle(false),
              background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
              marginBottom: "12px",
            }}
          >
            Join waitlist
          </button>
          <button
            type="button"
            onClick={() => setCapacityExceeded(false)}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255, 255, 255, 0.4)",
              fontSize: "13px",
              cursor: "pointer",
              padding: "8px",
            }}
          >
            Go back
          </button>
        </div>
      )}
```

- [ ] **Step 4: Hide the normal form controls when capacityExceeded is true**

Wrap the existing waitlist notice, error display, marketing checkbox, and submit buttons (lines 657-737) in a condition so they only show when NOT in the capacity exceeded state. Find the `{/* Waitlist notice */}` comment at line 657 and wrap everything from there through the submit buttons:

```jsx
      {!capacityExceeded && (
        <>
          {/* Waitlist notice */}
          {willGoToWaitlist && event?.waitlistEnabled && (
            /* ... existing waitlist banner ... */
          )}

          {/* Error */}
          {error && !error.includes("email") && (
            /* ... existing error display ... */
          )}

          {/* Marketing opt-in */}
          {/* ... existing checkbox ... */}

          {/* Submit buttons */}
          {/* ... existing buttons ... */}
        </>
      )}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RsvpForm.jsx
git commit -m "feat: add inline 'event full' state with explicit waitlist opt-in"
```

---

### Task 5: Handle `capacity_exceeded` in EventPage.jsx and Pass `joinWaitlist`

**Files:**
- Modify: `frontend/src/pages/EventPage.jsx:483-670` (handleRsvpSubmit function)

- [ ] **Step 1: Add `capacity_exceeded` error handling**

In EventPage.jsx `handleRsvpSubmit`, after the existing "full" error check at line 518, add handling for the new error. Replace lines 518-520:

```javascript
        if (res.status === 409 && err.error === "full") {
          return { error: "This event is sold out — no more spots available." };
        }

        if (res.status === 409 && err.error === "capacity_exceeded") {
          return { error: "capacity_exceeded", capacityExceeded: true };
        }
```

- [ ] **Step 2: Pass `joinWaitlist` through to the API**

In EventPage.jsx `handleRsvpSubmit`, the `requestBody` is built at line 488. The `data` object comes from RsvpForm's `onSubmit` call, which will now include `joinWaitlist: true` when the user clicks "Join waitlist" from the capacity exceeded state. No additional change needed here — `joinWaitlist` will flow through via the spread: `let requestBody = { ...data };` at line 488.

Verify: the `data` param at line 483 receives whatever RsvpForm passes to `onSubmit()`, and line 488 spreads it into `requestBody`, which is sent as JSON at line 512. The `joinWaitlist` field will be included automatically.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/EventPage.jsx
git commit -m "feat: handle capacity_exceeded response and pass joinWaitlist to backend"
```

---

### Task 6: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Start the dev servers**

```bash
cd /Users/felixcivalero/Projects/pullup/backend && npm run dev &
cd /Users/felixcivalero/Projects/pullup/frontend && npm run dev &
```

- [ ] **Step 2: Test the happy path (capacity available)**

1. Open an event page with available capacity
2. Fill out the RSVP form and submit
3. Verify: redirected to success page with "You're in!" — identical to current behavior

- [ ] **Step 3: Test the capacity exceeded → waitlist opt-in flow**

To simulate: temporarily set an event's `cocktail_capacity` to its current confirmed count (so it's exactly full). Then:

1. Load the event page — form should show "Register" (capacity looks available from stale data)
2. Submit the form
3. Verify: form shows "This event just filled up" inline state
4. Click "Join waitlist"
5. Verify: redirected to success page with "You're on the waitlist"
6. Reset the event's capacity back to normal

- [ ] **Step 4: Test the "Go back" button**

1. Trigger the capacity exceeded state (same as step 3)
2. Click "Go back"
3. Verify: form returns to normal state with all fields still filled in

- [ ] **Step 5: Test the pre-checked waitlist flow (unchanged)**

1. Open an event that's already visibly full (frontend shows "Join waitlist")
2. Fill out form and click "Join waitlist"
3. Verify: goes straight to success page with waitlist status — no "event just filled up" intermediate state

- [ ] **Step 6: Verify race condition is fixed**

Open two browser tabs to the same nearly-full event. Submit both simultaneously. Verify:
- One gets CONFIRMED
- The other gets the "event just filled up" state (not silently waitlisted)

- [ ] **Step 7: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: address issues found during e2e verification"
```
