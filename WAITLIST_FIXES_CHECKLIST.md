# Waitlist Logic Fixes Checklist - v2.1

**Goal:** Align waitlist logic with `PULLUP_SYSTEM_DOCUMENTATION_V2.md`

---

## 🔴 HIGH PRIORITY FIXES

### 1. Fix Dinner Capacity Check Logic (Backend)

**File:** `backend/src/data.js` (Line ~667-679)

**Issue:** Current logic checks `bookingStatus === "CONFIRMED"` before checking dinner capacity. Should check dinner capacity independently first, then apply all-or-nothing rule.

**Current Code:**

```javascript
if (finalDinnerPartySize <= availableSeats && bookingStatus === "CONFIRMED") {
  dinnerStatus = "CONFIRMED";
} else {
  dinnerStatus = "WAITLIST";
  if (bookingStatus === "CONFIRMED") {
    bookingStatus = "WAITLIST";
  }
}
```

**Problem:** If `bookingStatus` is already "WAITLIST" from cocktail check, dinner check won't work correctly.

**Fix:**

```javascript
if (finalDinnerPartySize > availableSeats) {
  // Dinner capacity exceeded - all-or-nothing
  dinnerStatus = "WAITLIST";
  bookingStatus = "WAITLIST";
} else {
  // Dinner capacity OK - confirm dinner only if event-level booking is still confirmed
  dinnerStatus = bookingStatus === "CONFIRMED" ? "CONFIRMED" : "WAITLIST";
}
```

**Test:**

- Cocktail full + dinner full → both WAITLIST ✅
- Cocktail OK + dinner full → both WAITLIST ✅
- Cocktail full + dinner OK → both WAITLIST ✅
- Cocktail OK + dinner OK → both CONFIRMED ✅

---

### 2. Add `waitlistEnabled` Check to Frontend Calculation

**File:** `frontend/src/components/EventCard.jsx` (Line ~89-91)

**Issue:** `willGoToWaitlist` doesn't check if waitlist is enabled, so it may show waitlist UI even when waitlist is disabled.

**Current Code:**

```javascript
const willGoToWaitlist =
  willGoToWaitlistForCocktails || willGoToWaitlistForDinner;
```

**Fix:**

```javascript
const willGoToWaitlist =
  event.waitlistEnabled &&
  (willGoToWaitlistForCocktails || willGoToWaitlistForDinner);
```

**Test:**

- Waitlist enabled + capacity exceeded → shows waitlist UI ✅
- Waitlist disabled + capacity exceeded → shows error, button disabled ✅

---

### 3. Verify Button Disabled State

**File:** `frontend/src/components/EventCard.jsx` (Line ~1106-1108)

**Status:** ✅ Already correct - button is disabled when `!event.waitlistEnabled && willGoToWaitlist`

**Action:** Verify this works correctly in all scenarios.

---

### 4. Improve Error Message for Waitlist Disabled

**File:** `frontend/src/pages/EventPage.jsx` (Line ~120-130)

**Issue:** When backend returns `{ error: "full" }`, frontend should show a clear, user-friendly message.

**Current:** May show generic error

**Fix:** Add specific handling for "full" error:

```javascript
if (res.status === 409 && err.error === "full") {
  showToast(
    "Event is full and waitlist is disabled. Please try another event.",
    "error"
  );
  return false;
}
```

**Test:**

- Waitlist disabled + capacity exceeded → shows clear error message ✅

---

## 🟡 MEDIUM PRIORITY FIXES

### 5. Fix Update RSVP - Dinner Slot Change

**File:** `backend/src/data.js` (Line ~983-1015)

**Issue:** When updating RSVP and changing dinner slot, need to properly exclude old slot from counts before checking new slot.

**Current:** Code excludes current RSVP from counts, but may not handle slot change correctly.

**Fix Required:**

- When slot changes, explicitly exclude from OLD slot's confirmed count
- Add to NEW slot's count
- Re-check capacity for new slot
- Update `dinnerBookingStatus` and `bookingStatus` accordingly

**Test:**

- Change slot from full → available → should confirm ✅
- Change slot from available → full → should waitlist ✅
- Change slot with party size increase → should recalculate ✅

---

### 6. Verify `updateRsvp()` Cocktail Capacity Check

**File:** `backend/src/data.js` (Line ~900-917)

**Status:** ✅ Already excludes current RSVP from `currentCocktailsOnly`

**Action:** Verify this works correctly when party size changes.

---

## 🟢 VERIFICATION ITEMS

### 7. Verify `getDinnerSlotCounts()` Only Counts CONFIRMED

**File:** `backend/src/data.js` (Line ~220-265)

**Status:** ✅ Already correct - filters by `dinner?.bookingStatus === "CONFIRMED"`

**Action:** Test to ensure waitlisted dinner bookings don't count toward slot capacity.

---

### 8. Verify Waitlist Status Display

**Files:**

- `frontend/src/pages/EventGuestsPage.jsx` - Waitlist badge and filter
- `frontend/src/pages/ManageEventPage.jsx` - Waitlist count in Overview

**Action:** Verify:

- [ ] Waitlist guests show "WAITLIST" badge (purple/pink, not green)
- [ ] Waitlist count in Overview tab matches actual waitlist RSVPs
- [ ] Filtering by "WAITLIST" status works correctly
- [ ] Waitlist count per dinner slot is correct

---

### 9. Verify Real-Time Capacity Updates

**File:** `frontend/src/pages/EventPage.jsx` (Line ~190-200)

**Status:** ✅ Already refetches event data after RSVP

**Action:** Verify:

- [ ] `cocktailSpotsLeft` updates immediately after RSVP
- [ ] `dinnerSlot.remaining` updates immediately after RSVP
- [ ] No race conditions (multiple rapid RSVPs)
- [ ] Capacity updates even if user doesn't refresh page

---

## 📋 Implementation Checklist

### Backend Fixes

- [ ] **Fix #1**: Dinner capacity check logic in `addRsvp()` (Line ~667-679)
- [ ] **Fix #5**: Update RSVP slot change logic (Line ~983-1015)
- [ ] **Verify #6**: Test `updateRsvp()` cocktail capacity check
- [ ] **Verify #7**: Test `getDinnerSlotCounts()` only counts CONFIRMED

### Frontend Fixes

- [ ] **Fix #2**: Add `waitlistEnabled` check to `willGoToWaitlist` (Line ~89-91)
- [ ] **Fix #4**: Improve error message for waitlist disabled (Line ~120-130)
- [ ] **Verify #3**: Test button disabled state
- [ ] **Verify #8**: Test waitlist status display
- [ ] **Verify #9**: Test real-time capacity updates

---

## 🧪 Complete Test Matrix

| Scenario | Cocktail Capacity | Dinner Capacity          | Waitlist Enabled | Expected Result                                     |
| -------- | ----------------- | ------------------------ | ---------------- | --------------------------------------------------- |
| 1        | Full (10/10)      | Available                | Yes              | WAITLIST (all)                                      |
| 2        | Full (10/10)      | Available                | No               | Error: "full"                                       |
| 3        | Available         | Full (0 left)            | Yes              | WAITLIST (all)                                      |
| 4        | Available         | Full (0 left)            | No               | Error: "full"                                       |
| 5        | Full (10/10)      | Full (0 left)            | Yes              | WAITLIST (all)                                      |
| 6        | Full (10/10)      | Full (0 left)            | No               | Error: "full"                                       |
| 7        | Available         | Available                | Yes              | CONFIRMED (all)                                     |
| 8        | Available         | Available                | No               | CONFIRMED (all)                                     |
| 9        | Full (10/10)      | Slot A full, B available | Yes              | Select A → WAITLIST, Select B → WAITLIST (cocktail) |
| 10       | Available         | Slot A full, B available | Yes              | Select A → WAITLIST, Select B → CONFIRMED           |

**Note:** Scenarios 9-10 test dinner slot selection with different cocktail capacities.

---

## ✅ Success Criteria

After fixes, the system should:

1. ✅ **All-or-Nothing Waitlist**: If ANY capacity (cocktail OR dinner) is exceeded, entire booking goes to waitlist
2. ✅ **Independent Capacity Checks**: Cocktail and dinner capacity checked independently, then combined
3. ✅ **Waitlist Disabled Handling**: Clear error when waitlist disabled and capacity exceeded
4. ✅ **Real-Time Feedback**: UI shows waitlist status before submission
5. ✅ **Correct Status Display**: Waitlist guests show correct badge and count
6. ✅ **Slot Change Handling**: Updating RSVP slot properly recalculates capacity

---

**Status:** Ready for implementation  
**Priority Order:** Fix #1 → Fix #2 → Fix #4 → Fix #5 → Verify #3, #6-9
