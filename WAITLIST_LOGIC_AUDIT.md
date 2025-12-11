# Waitlist Logic Audit - v2.1

**Goal:** Ensure waitlist logic matches `PULLUP_SYSTEM_DOCUMENTATION_V2.md` exactly.

---

## 📋 Complete Checklist - What Needs to be Fixed

### 🔴 HIGH PRIORITY

#### 1. **Dinner Capacity Check Logic - Fix Condition Order**

**File:** `backend/src/data.js` (Line ~667-679)

**Current Issue:** The dinner capacity check depends on `bookingStatus === "CONFIRMED"` which may already be WAITLIST from cocktail check. Should check dinner capacity independently first.

**Fix Required:**

- Check dinner capacity first (independent of cocktail check)
- If dinner capacity exceeded → set `dinnerBookingStatus = "WAITLIST"` AND `bookingStatus = "WAITLIST"` (all-or-nothing)
- If dinner capacity OK → set `dinnerBookingStatus = "CONFIRMED"` (only if `bookingStatus` is still CONFIRMED)

**Code to Fix:**

```javascript
// Current (WRONG - depends on bookingStatus):
if (finalDinnerPartySize <= availableSeats && bookingStatus === "CONFIRMED") {
  dinnerStatus = "CONFIRMED";
} else {
  dinnerStatus = "WAITLIST";
  if (bookingStatus === "CONFIRMED") {
    bookingStatus = "WAITLIST";
  }
}

// Should be (CORRECT - independent check):
if (finalDinnerPartySize > availableSeats) {
  dinnerStatus = "WAITLIST";
  bookingStatus = "WAITLIST"; // All-or-nothing
} else {
  // Only confirm dinner if event-level booking is still confirmed
  dinnerStatus = bookingStatus === "CONFIRMED" ? "CONFIRMED" : "WAITLIST";
}
```

---

#### 2. **Frontend Waitlist Calculation - Add `waitlistEnabled` Check**

**File:** `frontend/src/components/EventCard.jsx` (Line ~89-91)

**Current Issue:** `willGoToWaitlist` doesn't check if waitlist is enabled.

**Fix Required:**

```javascript
// Current:
const willGoToWaitlist =
  willGoToWaitlistForCocktails || willGoToWaitlistForDinner;

// Should be:
const willGoToWaitlist =
  event.waitlistEnabled &&
  (willGoToWaitlistForCocktails || willGoToWaitlistForDinner);
```

---

#### 3. **Button Disabled State - When Waitlist Disabled**

**File:** `frontend/src/components/EventCard.jsx` (Line ~1050-1100)

**Current Issue:** Button may not be disabled when waitlist disabled and capacity exceeded.

**Fix Required:**

- Disable button if `!event.waitlistEnabled && willGoToWaitlist`
- Show clear error message: "Event is full and waitlist is disabled"

---

### 🟡 MEDIUM PRIORITY

#### 4. **Update RSVP - Dinner Slot Change Logic**

**File:** `backend/src/data.js` (Line ~983-1015)

**Current Issue:** When updating RSVP and changing dinner slot, need to properly exclude old slot from counts.

**Fix Required:**

- When slot changes, exclude RSVP from old slot's confirmed count
- Add to new slot's count
- Re-check capacity for new slot
- Update `dinnerBookingStatus` accordingly

**Verify:** The code at line 991-1005 excludes current RSVP, but need to ensure it excludes from OLD slot when slot changes.

---

#### 5. **Error Message Display - Waitlist Disabled**

**File:** `frontend/src/pages/EventPage.jsx` (Line ~120-130)

**Current Issue:** When backend returns `{ error: "full" }`, frontend should show clear message.

**Fix Required:**

- Check if error is "full"
- Show message: "Event is full and waitlist is disabled. Please try another event."

---

### 🟢 LOW PRIORITY / VERIFICATION

#### 6. **Verify `getDinnerSlotCounts()` Only Counts CONFIRMED**

**File:** `backend/src/data.js` (Line ~220-265)

**Status:** ✅ Already correct - filters by `dinner?.bookingStatus === "CONFIRMED"`

**Action:** Verify this is working correctly in all cases.

---

#### 7. **Verify Waitlist Status Display**

**Files:**

- `frontend/src/pages/EventGuestsPage.jsx` - Waitlist badge
- `frontend/src/pages/ManageEventPage.jsx` - Waitlist count

**Status:** ✅ Likely correct, but verify:

- Waitlist guests show "WAITLIST" badge (not "ATTENDING")
- Waitlist count in Overview tab matches actual waitlist RSVPs
- Filtering by waitlist status works correctly

---

#### 8. **Verify Real-Time Capacity Updates**

**File:** `frontend/src/pages/EventPage.jsx` (Line ~190-200)

**Status:** ✅ Already refetches event data after RSVP

**Action:** Verify:

- `cocktailSpotsLeft` updates correctly
- `dinnerSlot.remaining` updates correctly
- No race conditions or stale data

---

## 🧪 Test Scenarios to Verify

### Scenario 1: Cocktail Capacity Full, Dinner Available

- **Setup:** `cocktailCapacity = 10`, `currentCocktailsOnly = 10`, dinner slots available
- **Action:** User books cocktails-only (`plusOnes = 3`, `wantsDinner = false`)
- **Expected:** `bookingStatus = "WAITLIST"` (cocktails-only = 3, exceeds capacity)

### Scenario 2: Cocktail Capacity Full, Dinner Only (No Cocktails)

- **Setup:** `cocktailCapacity = 10`, `currentCocktailsOnly = 10`, dinner slots available
- **Action:** User books dinner only (`dinnerPartySize = 4`, `plusOnes = 0`, `wantsDinner = true`)
- **Expected:** `bookingStatus = "CONFIRMED"` (cocktails-only = 0, fits capacity), `dinnerBookingStatus = "CONFIRMED"`

### Scenario 3: Dinner Capacity Full, Cocktails Available

- **Setup:** Dinner slot has 0 remaining, `cocktailCapacity = 50`, `currentCocktailsOnly = 10`
- **Action:** User books dinner party (`dinnerPartySize = 4`, `plusOnes = 0`, `wantsDinner = true`)
- **Expected:** `dinnerBookingStatus = "WAITLIST"`, `bookingStatus = "WAITLIST"` (all-or-nothing)

### Scenario 4: Dinner Capacity Full, Cocktails-Only Available

- **Setup:** Dinner slot has 0 remaining, `cocktailCapacity = 50`, `currentCocktailsOnly = 10`
- **Action:** User books cocktails-only (`plusOnes = 3`, `wantsDinner = false`)
- **Expected:** `bookingStatus = "CONFIRMED"` (cocktails available, no dinner)

### Scenario 5: Both Capacities Full

- **Setup:** `cocktailCapacity = 10`, `currentCocktailsOnly = 10`, dinner slot has 0 remaining
- **Action:** Any booking
- **Expected:** `bookingStatus = "WAITLIST"`

### Scenario 6: Waitlist Disabled, Capacity Exceeded

- **Setup:** `waitlistEnabled = false`, `cocktailCapacity = 10`, `currentCocktailsOnly = 10`
- **Action:** User tries to book cocktails-only (`plusOnes = 3`)
- **Expected:**
  - Backend returns `{ error: "full" }`
  - Frontend shows error message
  - Button is disabled

### Scenario 7: Dinner Slot Full, Other Slots Available

- **Setup:** Slot A has 0 remaining, Slot B has 10 remaining
- **Action:** User selects Slot A, books dinner (`dinnerPartySize = 4`)
- **Expected:** `dinnerBookingStatus = "WAITLIST"`, `bookingStatus = "WAITLIST"`

### Scenario 8: Dinner Slot Available, Other Slot Full

- **Setup:** Slot A has 0 remaining, Slot B has 10 remaining
- **Action:** User selects Slot B, books dinner (`dinnerPartySize = 4`)
- **Expected:** `dinnerBookingStatus = "CONFIRMED"`, `bookingStatus = "CONFIRMED"` (if cocktails available)

### Scenario 9: Update RSVP - Change Dinner Slot (Full → Available)

- **Setup:** RSVP has Slot A (full, waitlisted), change to Slot B (available)
- **Action:** Admin updates RSVP to Slot B
- **Expected:**
  - Removed from Slot A waitlist count
  - Added to Slot B confirmed count
  - `dinnerBookingStatus = "CONFIRMED"`
  - `bookingStatus = "CONFIRMED"` (if cocktails available)

### Scenario 10: Update RSVP - Increase Party Size (Within Capacity)

- **Setup:** RSVP has 2 people confirmed, increase to 5, capacity allows
- **Action:** Admin updates RSVP
- **Expected:**
  - Capacity recalculated
  - Status remains CONFIRMED if capacity allows
  - Status changes to WAITLIST if capacity exceeded

---

## 🎯 Implementation Order

1. **Fix #1**: Dinner capacity check logic (HIGH)
2. **Fix #2**: Frontend `waitlistEnabled` check (HIGH)
3. **Fix #3**: Button disabled state (HIGH)
4. **Fix #4**: Update RSVP slot change logic (MEDIUM)
5. **Fix #5**: Error message display (MEDIUM)
6. **Verify #6-8**: Test and verify existing functionality (LOW)

---

**Status:** Ready for implementation  
**Next Steps:** Start with HIGH priority fixes, test each scenario
