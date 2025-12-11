# Admin Override v1 - Implementation Complete ✅

**Version:** 2.1  
**Date:** December 2024  
**Status:** Fully implemented and ready for testing

---

## Overview

Admin Override v1 allows hosts to **confirm RSVPs even when capacity is exceeded**, with clear warnings in the admin UI, **without changing** public RSVP behavior.

### Key Principles

- **Public users**: Still hard-limited by capacity + waitlist rules (all-or-nothing)
- **Admins**: Can override capacity from the Guests tab and force a booking to `CONFIRMED`
- **Invariants**: Structural constraints (partySize, pull-up counts) still enforced

---

## Implementation Summary

### ✅ Backend Changes

#### 1. Updated `updateRsvp()` Function

**File:** `backend/src/data.js`

- Added `options` parameter with `forceConfirm` flag
- When `forceConfirm === true`:
  - Bypasses capacity checks
  - Forces `bookingStatus = "CONFIRMED"`
  - Forces `dinner.bookingStatus = "CONFIRMED"` if dinner is enabled
  - Sets optional `capacityOverridden` flag on RSVP

**Key Code:**

```javascript
export function updateRsvp(rsvpId, updates, options = {}) {
  const { forceConfirm = false } = options;
  // ... existing logic ...

  // Admin Override: forceConfirm bypasses capacity checks
  if (forceConfirm) {
    bookingStatus = "CONFIRMED";
    if (wantsDinner && dinnerPartySize > 0) {
      dinnerBookingStatus = "CONFIRMED";
      dinnerStatus = "confirmed";
    }
    capacityOverridden = true;
  }
}
```

#### 2. Updated PUT Route

**File:** `backend/src/index.js`

- Extracts `forceConfirm` from request body
- Passes it to `updateRsvp()` as an option (not stored directly on RSVP)

**Key Code:**

```javascript
const { forceConfirm, ...updates } = req.body;
const result = updateRsvp(rsvpId, updates, { forceConfirm: !!forceConfirm });
```

---

### ✅ Frontend Changes

#### 1. Capacity Detection Logic

**File:** `frontend/src/pages/EventGuestsPage.jsx` - `EditGuestModal`

- Calculates hypothetical new counts based on form values
- Compares against:
  - `event.cocktailCapacity` (for cocktails-only guests)
  - `event.dinnerMaxSeatsPerSlot` (for dinner slot capacity)
- Excludes current guest from counts when calculating
- Returns:
  - `willExceedCocktail`: boolean
  - `willExceedDinner`: boolean
  - `cocktailOverBy`: number
  - `dinnerOverBy`: number

**Key Logic:**

```javascript
const calculateCapacityExceedance = () => {
  // Calculate new partySize, cocktailsOnly, dinnerPartySize
  // Calculate current confirmed counts (excluding this guest)
  // Compare against capacities
  // Return exceedance flags and amounts
};
```

#### 2. Warning UI

**File:** `frontend/src/pages/EventGuestsPage.jsx` - `EditGuestModal`

- Shows red warning box when capacity would be exceeded
- Displays specific overage amounts:
  - "Cocktail capacity will be exceeded by X guests"
  - "Dinner capacity for this time slot will be exceeded by Y guests"
- Only shows for `status === "attending"` (confirmed bookings)

**UI Location:** Between form fields and submit buttons

#### 3. Button Label Change

**File:** `frontend/src/pages/EventGuestsPage.jsx` - `EditGuestModal`

- Normal case: "Save Changes"
- Over capacity: "Confirm anyway (over capacity)" (red gradient)
- Button color changes to red when over capacity

#### 4. Force Confirm Flag

**File:** `frontend/src/pages/EventGuestsPage.jsx` - `EditGuestModal` → `handleSubmit`

- Includes `forceConfirm: true` in PUT request when capacity exceeded
- Only sent when admin has seen warning and clicked "Confirm anyway"

**Key Code:**

```javascript
const updates = {
  // ... other fields ...
  forceConfirm:
    capacityCheck.willExceedCocktail || capacityCheck.willExceedDinner,
};
```

#### 5. Pass Guests List to Modal

**File:** `frontend/src/pages/EventGuestsPage.jsx`

- Updated `EditGuestModal` to accept `allGuests` prop
- Used for calculating current confirmed counts

---

## Data Model

### Optional Field Added

```typescript
type Rsvp = {
  // ... existing fields ...
  capacityOverridden?: boolean; // Set to true when admin uses forceConfirm
};
```

- **Backwards compatible**: Field is optional, defaults to `undefined`
- **Purpose**: UI can use this to show visual indicators (future enhancement)

---

## Behavior Matrix

| Scenario                 | Public RSVP  | Admin Update (No Override) | Admin Update (With Override) |
| ------------------------ | ------------ | -------------------------- | ---------------------------- |
| Within capacity          | ✅ CONFIRMED | ✅ CONFIRMED               | ✅ CONFIRMED                 |
| Over cocktail capacity   | ⚠️ WAITLIST  | ⚠️ WAITLIST                | ✅ CONFIRMED (forced)        |
| Over dinner capacity     | ⚠️ WAITLIST  | ⚠️ WAITLIST                | ✅ CONFIRMED (forced)        |
| Over both                | ⚠️ WAITLIST  | ⚠️ WAITLIST                | ✅ CONFIRMED (forced)        |
| Waitlist disabled + over | ❌ Error     | ❌ Error                   | ✅ CONFIRMED (forced)        |

---

## Testing Checklist

### Backend Tests

- [ ] `forceConfirm: true` bypasses cocktail capacity check
- [ ] `forceConfirm: true` bypasses dinner capacity check
- [ ] `forceConfirm: true` sets `bookingStatus = "CONFIRMED"`
- [ ] `forceConfirm: true` sets `dinner.bookingStatus = "CONFIRMED"` when dinner enabled
- [ ] `forceConfirm: false` (default) maintains normal behavior
- [ ] Structural invariants still enforced (partySize, pull-up counts)

### Frontend Tests

- [ ] Warning appears when cocktail capacity would be exceeded
- [ ] Warning appears when dinner capacity would be exceeded
- [ ] Warning shows correct overage amounts
- [ ] Button label changes to "Confirm anyway (over capacity)"
- [ ] Button color changes to red when over capacity
- [ ] `forceConfirm: true` sent in PUT request when over capacity
- [ ] `forceConfirm: false` (or omitted) sent when within capacity
- [ ] Warning only shows for `status === "attending"`

### Integration Tests

- [ ] Admin confirms guest over cocktail capacity → success, counts exceed capacity
- [ ] Admin confirms guest over dinner capacity → success, slot counts exceed capacity
- [ ] Admin confirms guest within capacity → unchanged behavior
- [ ] Public RSVP still blocked/waitlisted exactly as before

---

## Known Limitations (v1)

1. **No per-RSVP override tracking**: Only `capacityOverridden` flag, no detailed analytics
2. **No override history**: Can't see who/when overrides were applied
3. **No override indicators in Overview**: Over-capacity events not highlighted (future enhancement)
4. **Simple capacity calculation**: Frontend calculation is approximate (excludes waitlisted guests from counts)

---

## Future Enhancements (Post-v1)

1. **Overview indicators**: Show "Cocktail over capacity by 3" in ManageEventPage
2. **Override history**: Track who applied overrides and when
3. **Override analytics**: Dashboard showing over-capacity events
4. **Bulk override**: Allow confirming multiple waitlisted guests at once

---

## Files Modified

### Backend

- `backend/src/data.js` - Added `forceConfirm` option to `updateRsvp()`
- `backend/src/index.js` - Extract `forceConfirm` from PUT request body

### Frontend

- `frontend/src/pages/EventGuestsPage.jsx` - Added capacity detection, warning UI, button label change, `forceConfirm` flag

---

## Status

✅ **All features implemented and ready for testing**

The Admin Override v1 feature is complete and follows the specification. All backend and frontend changes have been made, and the system is ready for manual testing.
