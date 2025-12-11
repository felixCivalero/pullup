# RSVP Model Migration Checklist

This document lists all parts of the codebase that need to be updated to match the RSVP status model defined in `FULL_STACK_FLOW_AUDIT.md`.

## Expected Model (Source of Truth)

- `bookingStatus`: "CONFIRMED" | "WAITLIST" | "CANCELLED" (event-level)
- `dinner.bookingStatus`: "CONFIRMED" | "WAITLIST" | "CANCELLED" (dinner-level)
- `dinnerPullUpCount`: number (dinner arrival count, 0 initially)
- `cocktailOnlyPullUpCount`: number (cocktails-only arrival count, 0 initially)
- `dinner.slotTime`: ISO string (replaces `dinnerTimeSlot`)
- `dinner.partySize`: number (replaces `dinnerPartySize`)
- `dinner.enabled`: boolean (replaces `wantsDinner`)

---

## Backend Updates Required

### `backend/src/data.js`

#### 1. **RSVP Object Structure in `addRsvp()` function (line ~608)**

- ❌ Currently uses: `status: "attending" | "waitlist"`
- ✅ Should use: `bookingStatus: "CONFIRMED" | "WAITLIST"`
- ❌ Currently uses: `dinnerStatus: "confirmed" | "waitlist" | "cocktails" | "cocktails_waitlist" | null`
- ✅ Should use: `dinner: { bookingStatus: "CONFIRMED" | "WAITLIST", ... }`
- ❌ Currently uses: `pulledUpForDinner: null`, `pulledUpForCocktails: null`
- ✅ Should use: `dinnerPullUpCount: 0`, `cocktailOnlyPullUpCount: 0`
- ❌ Currently uses: `dinnerTimeSlot`, `dinnerPartySize`, `wantsDinner` as top-level fields
- ✅ Should use: `dinner: { slotTime, partySize, enabled, bookingStatus }` nested object

#### 2. **`updateRsvp()` function (line ~664)**

- ❌ Currently handles: `updates.pulledUpForDinner`, `updates.pulledUpForCocktails`
- ✅ Should handle: `updates.dinnerPullUpCount`, `updates.cocktailOnlyPullUpCount`
- ❌ Currently handles: `updates.status` (attending/waitlist)
- ✅ Should handle: `updates.bookingStatus` (CONFIRMED/WAITLIST/CANCELLED)
- ❌ Currently handles: `updates.dinnerStatus` (confirmed/waitlist/cocktails/cocktails_waitlist)
- ✅ Should handle: `updates["dinner.bookingStatus"]` or nested `dinner.bookingStatus`
- ❌ Currently derives: `pulledUp`, `pulledUpCount` from `pulledUpForDinner`/`pulledUpForCocktails`
- ✅ Should remove derived fields (or keep only for backward compatibility)

#### 3. **`getEventCounts()` function (line ~162)**

- ❌ Currently filters: `r.status === "attending"`
- ✅ Should filter: `r.bookingStatus === "CONFIRMED"`
- ❌ Currently filters: `r.status === "waitlist"`
- ✅ Should filter: `r.bookingStatus === "WAITLIST"`

#### 4. **`getCocktailsOnlyCount()` function (line ~175)**

- ❌ Currently filters: `r.status === "attending"`
- ✅ Should filter: `r.bookingStatus === "CONFIRMED"`
- ❌ Currently checks: `r.dinnerStatus === "confirmed"`
- ✅ Should check: `r.dinner?.bookingStatus === "CONFIRMED"`

#### 5. **`getDinnerSlotCounts()` function (line ~217)**

- ❌ Currently filters: `r.dinnerStatus === "confirmed"`
- ✅ Should filter: `r.dinner?.bookingStatus === "CONFIRMED"`
- ❌ Currently filters: `r.dinnerStatus === "waitlist"`
- ✅ Should filter: `r.dinner?.bookingStatus === "WAITLIST"`
- ❌ Currently uses: `r.dinnerTimeSlot`
- ✅ Should use: `r.dinner?.slotTime`

#### 6. **`getDinnerCounts()` function (line ~253)**

- ❌ Currently filters: `r.dinnerStatus === "confirmed"`
- ✅ Should filter: `r.dinner?.bookingStatus === "CONFIRMED"`
- ❌ Currently filters: `r.dinnerStatus === "waitlist"`
- ✅ Should filter: `r.dinner?.bookingStatus === "WAITLIST"`

#### 7. **`getAllPeopleWithStats()` function (line ~349)**

- ❌ Currently checks: `r.status === "attending"`
- ✅ Should check: `r.bookingStatus === "CONFIRMED"`
- ❌ Currently checks: `r.status === "waitlist"`
- ✅ Should check: `r.bookingStatus === "WAITLIST"`
- ❌ Currently checks: `r.dinnerStatus === "confirmed"`
- ✅ Should check: `r.dinner?.bookingStatus === "CONFIRMED"`

### `backend/src/index.js`

#### 8. **`POST /events/:slug/rsvp` endpoint (line ~209)**

- ❌ Currently returns: `statusDetails: { cocktailStatus: "attending" | "waitlist", dinnerStatus: "confirmed" | "waitlist" | ... }`
- ✅ Should return: `statusDetails: { bookingStatus: "CONFIRMED" | "WAITLIST", dinnerBookingStatus: "CONFIRMED" | "WAITLIST" | null }`

#### 9. **`PUT /host/events/:eventId/rsvps/:rsvpId` endpoint (line ~420)**

- ❌ Currently extracts: `status`, `pulledUpForDinner`, `pulledUpForCocktails`
- ✅ Should extract: `bookingStatus`, `dinnerPullUpCount`, `cocktailOnlyPullUpCount`, `"dinner.bookingStatus"`
- ❌ Currently passes: `status`, `pulledUpForDinner`, `pulledUpForCocktails` to `updateRsvp()`
- ✅ Should pass: `bookingStatus`, `dinnerPullUpCount`, `cocktailOnlyPullUpCount`, `dinner.bookingStatus` to `updateRsvp()`

---

## Frontend Updates Required

### `frontend/src/pages/EventPage.jsx`

#### 10. **RSVP Response Handling (line ~138)**

- ❌ Currently uses: `cocktailStatus: body.rsvp?.status || "attending"`
- ✅ Should use: `bookingStatus: body.statusDetails?.bookingStatus || "CONFIRMED"`
- ❌ Currently uses: `dinnerStatus: body.statusDetails?.dinnerStatus`
- ✅ Should use: `dinnerBookingStatus: body.statusDetails?.dinnerBookingStatus`

#### 11. **Status Display Logic (line ~151)**

- ❌ Currently checks: `cocktailStatus === "waitlist"`
- ✅ Should check: `bookingStatus === "WAITLIST"`
- ❌ Currently checks: `dinnerStatus === "waitlist"`, `dinnerStatus === "cocktails_waitlist"`
- ✅ Should check: `dinnerBookingStatus === "WAITLIST"`

### `frontend/src/pages/EventGuestsPage.jsx`

#### 12. **Guest Table Display (line ~1202)**

- ❌ Currently reads: `g.pulledUpForCocktails`, `g.pulledUpForDinner`
- ✅ Should read: `g.cocktailOnlyPullUpCount`, `g.dinnerPullUpCount`

#### 13. **Stats Calculation (line ~144)**

- ❌ Currently uses: `g.pulledUpForCocktails`, `g.pulledUpForDinner`
- ✅ Should use: `g.cocktailOnlyPullUpCount`, `g.dinnerPullUpCount`

#### 14. **Status Filtering (line ~452)**

- ❌ Currently checks: `g.status === "waitlist"`
- ✅ Should check: `g.bookingStatus === "WAITLIST"`

#### 15. **PulledUpModal Component (line ~2403)**

- ❌ Currently uses state: `pulledUpForDinner`, `pulledUpForCocktails`
- ✅ Should use state: `dinnerPullUpCount`, `cocktailOnlyPullUpCount`
- ❌ Currently reads from: `guest.pulledUpForDinner`, `guest.pulledUpForCocktails`
- ✅ Should read from: `guest.dinnerPullUpCount`, `guest.cocktailOnlyPullUpCount`
- ❌ Currently checks: `guest.dinnerStatus === "confirmed"`
- ✅ Should check: `guest.dinner?.bookingStatus === "CONFIRMED"`

#### 16. **PulledUpModal onSave Callback (line ~1359)**

- ❌ Currently sends: `pulledUpForDinner`, `pulledUpForCocktails` in request body
- ✅ Should send: `dinnerPullUpCount`, `cocktailOnlyPullUpCount` in request body

#### 17. **Helper Functions (line ~243, ~267, ~298)**

- ❌ `updateLocalPulledUpState()` uses: `pulledUpForDinner`, `pulledUpForCocktails`
- ✅ Should use: `dinnerPullUpCount`, `cocktailOnlyPullUpCount`
- ❌ `persistPulledUpChange()` uses: `pulledUpForDinner`, `pulledUpForCocktails`
- ✅ Should use: `dinnerPullUpCount`, `cocktailOnlyPullUpCount`
- ❌ `handlePulledUpChange()` uses: `pulledUpForDinner`, `pulledUpForCocktails`
- ✅ Should use: `dinnerPullUpCount`, `cocktailOnlyPullUpCount`

### `frontend/src/pages/ManageEventPage.jsx`

#### 18. **Stats Calculation in OverviewTabContent (line ~115)**

- ❌ Currently checks: `g.status === "waitlist"`, `g.status === "attending"`
- ✅ Should check: `g.bookingStatus === "WAITLIST"`, `g.bookingStatus === "CONFIRMED"`

#### 19. **Dinner Status Checks (line ~135)**

- ❌ Currently checks: `g.dinnerStatus === "cocktails_waitlist"`, `g.dinnerStatus === "waitlist"`
- ✅ Should check: `g.dinner?.bookingStatus === "WAITLIST"`

#### 20. **Pulled Up Counts (line ~144)**

- ❌ Currently uses: `g.pulledUpForCocktails`, `g.pulledUpForDinner`
- ✅ Should use: `g.cocktailOnlyPullUpCount`, `g.dinnerPullUpCount`

#### 21. **Dinner Slot Pull-Up Calculation (line ~286)**

- ❌ Currently filters: `g.dinnerTimeSlot === slot.time`
- ✅ Should filter: `g.dinner?.slotTime === slot.time`
- ❌ Currently checks: `g.dinnerStatus === "confirmed"`
- ✅ Should check: `g.dinner?.bookingStatus === "CONFIRMED"`
- ❌ Currently uses: `g.pulledUpForDinner`
- ✅ Should use: `g.dinnerPullUpCount`

---

## Summary

**Total Files to Update:** 3

- `backend/src/data.js` (7 functions)
- `backend/src/index.js` (2 endpoints)
- `frontend/src/pages/EventPage.jsx` (2 sections)
- `frontend/src/pages/EventGuestsPage.jsx` (6 sections)
- `frontend/src/pages/ManageEventPage.jsx` (4 sections)

**Key Changes:**

1. Rename `status` → `bookingStatus` with uppercase values ("CONFIRMED"/"WAITLIST"/"CANCELLED")
2. Rename `dinnerStatus` → `dinner.bookingStatus` with uppercase values
3. Rename `pulledUpForDinner` → `dinnerPullUpCount`
4. Rename `pulledUpForCocktails` → `cocktailOnlyPullUpCount`
5. Restructure dinner fields into nested `dinner` object: `{ enabled, partySize, slotTime, bookingStatus }`
6. Update all filtering/checking logic to use new field names and values
