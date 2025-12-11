# PullUp System Documentation v3.0

**Last Updated:** December 2024  
**Version:** 3.0  
**Status:** Feature Complete (In-Memory) - Ready for Supabase Migration

---

## Table of Contents

1. [System Overview](#system-overview)
2. [What's New in v3.0](#whats-new-in-v30)
3. [Dynamic Party Composition System (DPCS)](#dynamic-party-composition-system-dpcs)
4. [RSVP Status Model](#rsvp-status-model)
5. [Data Structures](#data-structures)
6. [Admin Override System](#admin-override-system)
7. [Waitlist System](#waitlist-system)
8. [Capacity Management & Over-Capacity Indicators](#capacity-management--over-capacity-indicators)
9. [UX & User Experience](#ux--user-experience)
10. [Frontend Routes](#frontend-routes)
11. [Backend API Routes](#backend-api-routes)
12. [Core Business Logic](#core-business-logic)
13. [Check-In System](#check-in-system)
14. [Full-Stack Data Flow](#full-stack-data-flow)
15. [Supabase Migration Readiness](#supabase-migration-readiness)

---

## System Overview

PullUp is a dynamic event management and RSVP system that enables flexible guest allocation for events with optional dinner components. The system's core innovation is the **Dynamic Party Composition System (DPCS)**, which allows seamless transitions between cocktail-only events and events with dinner, while maintaining accurate capacity tracking.

### Key Features

- **Flexible Guest Allocation**: Support for cocktail-only guests and dinner parties with additional cocktail guests
- **Dynamic Capacity Management**: Separate tracking for cocktail capacity and dinner slot capacity
- **Real-time Waitlist**: All-or-nothing waitlist system with clear user feedback
- **Admin Override**: Hosts can confirm RSVPs beyond capacity with clear warnings
- **Over-Capacity Indicators**: Visual indicators throughout the admin UI showing when capacity is exceeded
- **Check-In System**: Separate tracking for dinner and cocktails-only arrivals
- **CRM Integration**: Contact management with event history tracking
- **Polished UX**: Clear messaging, consistent behavior, and intuitive user flows

---

## What's New in v3.0

### ✅ Version 2.1 - Waitlist Logic Fixes

**Completed:** December 2024

- **Fixed Dinner Capacity Check Logic**: Dinner capacity now checked independently, ensuring all-or-nothing waitlist behavior
- **Added `waitlistEnabled` Check**: Frontend now respects waitlist settings
- **Improved Error Messages**: Clear messaging when waitlist is disabled and capacity exceeded
- **Enhanced Error UI**: Visual error boxes with specific capacity details

**Files Modified:**

- `backend/src/data.js` - Fixed `addRsvp()` and `updateRsvp()` capacity checks
- `frontend/src/components/EventCard.jsx` - Added waitlist enabled check and error UI
- `frontend/src/pages/EventPage.jsx` - Improved error messages

### ✅ Admin Override v1

**Completed:** December 2024

- **Force Confirm Beyond Capacity**: Admins can override capacity limits when updating guests
- **Capacity Detection**: Frontend calculates if changes would exceed capacity
- **Warning UI**: Clear warnings with specific overage amounts
- **Override Preservation**: Over-capacity guests maintain CONFIRMED status through subsequent updates
- **Visual Indicators**: "Over capacity" badges in guest list and overview

**Key Features:**

- `forceConfirm` flag in `updateRsvp()` bypasses capacity checks
- `capacityOverridden` flag marks RSVPs that exceeded capacity
- Frontend shows warnings and changes button labels when over capacity
- Over-capacity guests can be checked in without reverting to waitlist

**Files Modified:**

- `backend/src/data.js` - Added `forceConfirm` option and override logic
- `backend/src/index.js` - Extract `forceConfirm` from PUT requests
- `frontend/src/pages/EventGuestsPage.jsx` - Capacity detection, warnings, and indicators

### ✅ UX Polish v1

**Completed:** December 2024

- **Button Labels**: "RSVP" vs "Join waitlist" based on capacity
- **Toast Messages**: Context-specific success/waitlist messages with subtext
- **Status Badges**: Clear "CONFIRMED" and "WAITLIST" badges
- **Capacity Messages**: Error, warning, and info boxes with specific messaging
- **Form Reordering**: Dinner option appears before plus-ones for better UX flow

**Files Modified:**

- `frontend/src/components/EventCard.jsx` - Button labels, capacity messages, form reordering
- `frontend/src/components/Toast.jsx` - Added subtext support
- `frontend/src/pages/EventPage.jsx` - Updated toast messages
- `frontend/src/pages/EventGuestsPage.jsx` - Status badges and over-capacity indicators

### ✅ Over-Capacity Indicators in Overview

**Completed:** December 2024

- **Dinner Slot Over-Capacity**: Shows "Over capacity by X" for slots exceeding capacity
- **Total Capacity Over-Capacity**: Badge showing "Over by X" on capacity cards
- **Cocktail Capacity Over-Capacity**: Badge showing "Over by X" on cocktail capacity card
- **Real-Time Calculations**: All counts calculated from guest data (not API cache)
- **Fixed Dinner Slot Counts**: Slot confirmed counts now calculated from guest data directly

**Files Modified:**

- `frontend/src/pages/ManageEventPage.jsx` - Added over-capacity calculations and indicators

---

## Dynamic Party Composition System (DPCS)

### 🎯 Core Principle

**The booker is automatically included in `dinnerPartySize` when dinner is selected.** This enables a dinner party of 4 to have +3 people on the cocktail list (total = 7).

### Algorithm

```typescript
/**
 * Calculate total party size using Dynamic Party Composition System
 * @param {boolean} wantsDinner - Whether dinner is selected
 * @param {number} dinnerPartySize - Number of people for dinner (includes booker if wantsDinner)
 * @param {number} plusOnes - Number of cocktails-only guests
 * @returns {number} Total party size
 */
function calculatePartySize(wantsDinner, dinnerPartySize, plusOnes) {
  if (wantsDinner) {
    // Dinner includes booker, add cocktails-only guests
    return dinnerPartySize + plusOnes;
  } else {
    // No dinner: booker + cocktails-only guests
    return 1 + plusOnes;
  }
}

/**
 * Calculate cocktails-only count using Dynamic Party Composition System
 * @param {boolean} wantsDinner - Whether dinner is selected
 * @param {number} partySize - Total party size
 * @param {number} plusOnes - Number of cocktails-only guests
 * @returns {number} Number of cocktails-only guests
 */
function calculateCocktailsOnly(wantsDinner, partySize, plusOnes) {
  if (wantsDinner) {
    // Only plusOnes are cocktails-only (dinnerPartySize goes to dinner)
    return plusOnes;
  } else {
    // Entire party is cocktails-only (booker + plusOnes)
    return partySize;
  }
}
```

### Examples

| Scenario                | `wantsDinner` | `dinnerPartySize` | `plusOnes` | `partySize` | `cocktailsOnly` |
| ----------------------- | ------------- | ----------------- | ---------- | ----------- | --------------- |
| No dinner, no guests    | `false`       | `0`               | `0`        | `1`         | `1`             |
| No dinner, +2 guests    | `false`       | `0`               | `2`        | `3`         | `3`             |
| Dinner for 1, no guests | `true`        | `1`               | `0`        | `1`         | `0`             |
| Dinner for 4, +3 guests | `true`        | `4`               | `3`        | `7`         | `3`             |
| Dinner for 2, +1 guest  | `true`        | `2`               | `1`        | `3`         | `1`             |

### Implementation Locations

- **Backend**: `backend/src/data.js` - `calculatePartySize()`, `calculateCocktailsOnly()`
- **Frontend**: `frontend/src/components/EventCard.jsx` - RSVP form calculations
- **Guest List**: `frontend/src/pages/EventGuestsPage.jsx` - Display and stats
- **Overview**: `frontend/src/pages/ManageEventPage.jsx` - Event statistics

---

## RSVP Status Model

### Booking Status Hierarchy

```typescript
type BookingStatus = "CONFIRMED" | "WAITLIST" | "CANCELLED";

type DinnerBookingStatus = "CONFIRMED" | "WAITLIST" | null;

type Rsvp = {
  // Event-level status
  bookingStatus: BookingStatus; // "CONFIRMED" | "WAITLIST" | "CANCELLED"
  status: string; // Backward compatibility: "attending" | "waitlist" | "cancelled"

  // Dinner-level status
  dinner: {
    enabled: boolean;
    partySize: number;
    slotTime: string; // ISO timestamp
    bookingStatus: DinnerBookingStatus; // "CONFIRMED" | "WAITLIST" | null
  } | null;

  // Admin override marker
  capacityOverridden?: boolean; // Set to true when admin uses forceConfirm

  // Pull-up counts
  dinnerPullUpCount: number; // 0..dinner.partySize
  cocktailOnlyPullUpCount: number; // 0..plusOnes
};
```

### All-or-Nothing Waitlist

**Critical Rule:** If any part of a booking (cocktail or dinner) exceeds capacity, the entire booking (event-level and dinner-level) is placed on waitlist.

**Exception:** Admin override can force CONFIRMED status even when capacity is exceeded.

---

## Admin Override System

### Overview

Admin Override v1 allows hosts to confirm RSVPs even when capacity is exceeded, with clear warnings in the admin UI, without changing public RSVP behavior.

### Key Principles

- **Public users**: Still hard-limited by capacity + waitlist rules (all-or-nothing)
- **Admins**: Can override capacity from the Guests tab and force a booking to `CONFIRMED`
- **Invariants**: Structural constraints (partySize, pull-up counts) still enforced

### Implementation

#### Backend

```javascript
export function updateRsvp(rsvpId, updates, options = {}) {
  const { forceConfirm = false } = options;

  // ... normal capacity checks ...

  // Admin Override: forceConfirm bypasses capacity checks
  // Also preserve override if guest was already over capacity
  const wasAlreadyOverCapacity = rsvp.capacityOverridden === true;

  if (forceConfirm || wasAlreadyOverCapacity) {
    bookingStatus = "CONFIRMED";
    if (wantsDinner && dinnerPartySize > 0) {
      dinnerBookingStatus = "CONFIRMED";
      dinnerStatus = "confirmed";
    }
    capacityOverridden = true;
  }
}
```

#### Frontend

- **Capacity Detection**: Calculates if changes would exceed capacity
- **Warning UI**: Shows red warning box with specific overage amounts
- **Button Label**: Changes to "Confirm anyway (over capacity)" when over capacity
- **Force Confirm Flag**: Automatically included in PUT request when capacity exceeded

### Visual Indicators

- **Guest List**: "Over capacity" badge (amber) next to CONFIRMED status
- **Overview**: "Over by X" badges on capacity cards and dinner slots
- **Tooltip**: "This guest was confirmed by overriding capacity limits"

---

## Waitlist System

### All-or-Nothing Behavior

The waitlist system follows an **all-or-nothing** policy:

- If cocktail capacity is exceeded → entire booking goes to waitlist
- If dinner capacity is exceeded → entire booking goes to waitlist
- If both are exceeded → entire booking goes to waitlist

### Waitlist Rules

1. **Capacity Check Order**:

   - Cocktail capacity checked first
   - Dinner capacity checked independently (not dependent on cocktail check)
   - If either exceeds → all-or-nothing waitlist

2. **Waitlist Enabled Check**:

   - Frontend checks `event.waitlistEnabled` before showing waitlist UI
   - If disabled and capacity exceeded → shows error, disables button

3. **Dinner Slot Selection**:
   - If no slot selected but all slots are full → shows waitlist
   - If specific slot selected and full → shows waitlist for that slot

### Public RSVP Flow

1. User fills out RSVP form
2. System calculates `willGoToWaitlist` based on:
   - `willGoToWaitlistForCocktails` (cocktails-only count > available spots)
   - `willGoToWaitlistForDinner` (dinner party size > slot remaining OR all slots full)
3. Button label changes: "RSVP" → "Join waitlist"
4. Warning message shows specific capacity details
5. On submit, backend applies all-or-nothing logic

---

## Capacity Management & Over-Capacity Indicators

### Capacity Types

1. **Cocktail Capacity** (`cocktailCapacity`): Maximum cocktails-only guests
2. **Dinner Slot Capacity** (`dinnerMaxSeatsPerSlot`): Maximum guests per dinner time slot
3. **Total Capacity** (`totalCapacity`): Informational total (cocktailCapacity + foodCapacity)

### Over-Capacity Indicators

#### Overview Tab

**Total Capacity Card:**

- Shows "Over by X" badge when `attending > totalCapacity`
- Changes color to amber when over capacity

**Cocktail Capacity Card:**

- Shows "Over by X" badge when `cocktailsOnly > cocktailCapacity`
- Changes color to amber when over capacity

**Dinner Slots:**

- Shows "Over capacity by X" badge when `confirmed > capacity` for that slot
- Changes count color to amber when over capacity
- Calculated from guest data directly (not API cache)

#### Guest List

- **Status Badge**: "Over capacity" badge (amber) next to CONFIRMED status
- **Tooltip**: Explains that guest was confirmed by overriding capacity limits

### Capacity Calculations

All capacity calculations use guest data directly:

```javascript
// Dinner slot confirmed count (from guest data)
const confirmed = guests
  .filter((g) => {
    const wantsDinner = g.dinner?.enabled || g.wantsDinner;
    const slotMatches =
      g.dinner?.slotTime === slot.time || g.dinnerTimeSlot === slot.time;
    const isConfirmed =
      g.dinner?.bookingStatus === "CONFIRMED" || g.dinnerStatus === "confirmed";
    return wantsDinner && slotMatches && isConfirmed;
  })
  .reduce(
    (sum, g) =>
      sum + (g.dinner?.partySize || g.dinnerPartySize || g.partySize || 1),
    0
  );
```

This ensures accuracy even when dinner is added after event creation.

---

## UX & User Experience

### Public RSVP Form

**Button States:**

- Normal: "RSVP" (purple gradient)
- Will waitlist: "Join waitlist" (pink gradient)
- Loading: Shows spinner with appropriate label
- Disabled: When waitlist disabled and capacity exceeded

**Capacity Messages:**

- **Error** (waitlist disabled): "Event is full" with contact instructions
- **Warning** (will waitlist): "You'll join the waitlist" with context-specific details
- **Info** (normal): "You'll receive a confirmation on this screen once your RSVP is submitted"

**Form Flow:**

1. Email & Name
2. Dinner option (if enabled)
3. Plus-ones input
4. Summary & messages
5. Submit button

### Toast Messages

**Success (CONFIRMED):**

- Message: "You're in 🎉"
- Subtext (if dinner): "Your dinner time is confirmed. Check the details above."

**Waitlist:**

- Message: "You're on the waitlist"
- Subtext (dinner): "Dinner is full right now. The host will reach out if a table opens."
- Subtext (cocktails): "The event is full right now. The host will reach out if a spot opens."

### Admin UI

**Status Badges:**

- "CONFIRMED" (green) - Confirmed bookings
- "WAITLIST" (purple/pink) - Waitlisted bookings
- "Over capacity" (amber) - Over-capacity confirmed bookings

**Edit Guest Modal:**

- Warning when changes would exceed capacity
- Button label: "Save changes" vs "Confirm anyway (over capacity)"
- Specific overage amounts displayed

---

## Data Structures

### Event

```typescript
type Event = {
  id: string;
  slug: string; // Unique identifier for public URL
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string; // ISO timestamp
  endsAt: string; // ISO timestamp
  timezone: string;

  // Capacity
  cocktailCapacity: number | null;
  foodCapacity: number | null;
  totalCapacity: number | null;
  maxPlusOnesPerGuest: number;

  // Waitlist
  waitlistEnabled: boolean;

  // Dinner
  dinnerEnabled: boolean;
  dinnerStartTime: string | null; // ISO timestamp
  dinnerEndTime: string | null; // ISO timestamp
  dinnerSeatingIntervalHours: number; // Default: 2
  dinnerMaxSeatsPerSlot: number | null;

  // Other
  imageUrl: string | null;
  visibility: "public" | "private";
  calendarCategory: "personal" | "business";
  ticketType: "free" | "paid";

  // Computed (from API)
  _attendance?: {
    confirmed: number;
    cocktailSpotsLeft: number | null;
  };
};
```

### RSVP

```typescript
type Rsvp = {
  id: string;
  personId: string; // Link to Person
  eventId: string; // Link to Event
  slug: string; // Event slug for public URL

  // Booking status
  bookingStatus: "CONFIRMED" | "WAITLIST" | "CANCELLED";
  status: string; // Backward compatibility: "attending" | "waitlist" | "cancelled"

  // Party composition (DPCS)
  plusOnes: number; // Cocktails-only guests
  partySize: number; // Total unique guests (calculated via DPCS)

  // Dinner
  dinner: {
    enabled: boolean;
    partySize: number; // Includes booker
    slotTime: string; // ISO timestamp
    bookingStatus: "CONFIRMED" | "WAITLIST"; // null if no dinner
  } | null;

  // Backward compatibility fields
  wantsDinner: boolean;
  dinnerStatus: "confirmed" | "waitlist" | null;
  dinnerTimeSlot: string | null;
  dinnerPartySize: number | null;

  // Admin override
  capacityOverridden?: boolean; // Set when admin uses forceConfirm

  // Pull-up counts
  dinnerPullUpCount: number; // 0..dinner.partySize
  cocktailOnlyPullUpCount: number; // 0..plusOnes

  // Backward compatibility
  pulledUpForDinner: number | null;
  pulledUpForCocktails: number | null;

  // Metadata
  totalGuests: number; // Calculated once and stored
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
};
```

### Person

```typescript
type Person = {
  id: string;
  email: string; // Unique, normalized (lowercase)
  name: string | null;
  stripeCustomerId: string | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
};
```

---

## Frontend Routes

### Public Routes

- `/e/:slug` - Public event page with RSVP form
- `/` - Landing page (if exists)

### Protected Routes (Admin)

- `/home` - Dashboard with events list, settings, CRM
- `/create` - Create new event
- `/app/events/:id/manage` - Manage event (Overview, Guests, Edit tabs)
- `/app/events/:id/guests` - Guest list (alternative route)

---

## Backend API Routes

### Public Routes

- `GET /events/:slug` - Get public event details
- `POST /events/:slug/rsvp` - Create RSVP
- `GET /events/:slug/dinner-slots` - Get dinner slot availability

### Host Routes

- `GET /host/events` - List all events
- `GET /host/events/:eventId` - Get event details
- `POST /host/events` - Create event
- `PUT /host/events/:eventId` - Update event
- `DELETE /host/events/:eventId` - Delete event
- `GET /host/events/:eventId/guests` - Get all guests for event
- `PUT /host/events/:eventId/rsvps/:rsvpId` - Update RSVP (supports `forceConfirm`)
- `DELETE /host/events/:eventId/rsvps/:rsvpId` - Delete RSVP
- `GET /host/people` - Get all contacts

---

## Core Business Logic

### RSVP Creation (`addRsvp`)

1. Validate email and find/create person
2. Calculate party size using DPCS
3. Check cocktail capacity → set `bookingStatus`
4. If dinner selected:
   - Validate time slot
   - Check dinner slot capacity → set `dinnerBookingStatus`
   - Apply all-or-nothing logic
5. Create RSVP with calculated values
6. Return event and RSVP

### RSVP Update (`updateRsvp`)

1. Handle email/name updates (update person record)
2. Calculate new party size using DPCS
3. Check cocktail capacity → set `bookingStatus`
4. If dinner selected:
   - Validate time slot
   - Check dinner slot capacity → set `dinnerBookingStatus`
   - Apply all-or-nothing logic
5. **Admin Override**: If `forceConfirm === true` or `capacityOverridden === true`:
   - Force `bookingStatus = "CONFIRMED"`
   - Force `dinnerBookingStatus = "CONFIRMED"` (if dinner)
   - Set `capacityOverridden = true`
6. Update pull-up counts (with validation)
7. Update RSVP record
8. Return updated RSVP

### Capacity Calculations

**Cocktail Capacity:**

```javascript
const currentCocktailsOnly = getCocktailsOnlyCount(eventId);
const cocktailsOnlyForThisBooking = calculateCocktailsOnly(
  wantsDinner,
  partySize,
  plusOnes
);

if (currentCocktailsOnly + cocktailsOnlyForThisBooking > cocktailCapacity) {
  bookingStatus = "WAITLIST"; // All-or-nothing
}
```

**Dinner Capacity:**

```javascript
const slotCounts = getDinnerSlotCounts(eventId, dinnerTimeSlot);
const availableSeats = slotCapacity - slotCounts.confirmed;

if (dinnerPartySize > availableSeats) {
  dinnerBookingStatus = "WAITLIST";
  bookingStatus = "WAITLIST"; // All-or-nothing
}
```

---

## Check-In System

### Pull-Up Counts

- **`dinnerPullUpCount`**: Number of dinner guests who have arrived (0..`dinner.partySize`)
- **`cocktailOnlyPullUpCount`**: Number of cocktails-only guests who have arrived (0..`plusOnes`)

### Rules

1. Pull-up counts only apply to CONFIRMED bookings
2. Pull-up counts cannot exceed their respective maximums
3. Pull-up status is derived: NONE, PARTIAL, FULL

### Display

- **Guest List**: Shows cocktail and dinner pull-up counts separately
- **Overview**: Shows total pulled up vs total attending
- **Dinner Slots**: Shows pulled up count per slot

---

## Full-Stack Data Flow

### RSVP Creation Flow

1. **Frontend** (`EventCard.jsx`):

   - User fills form
   - Calculates `willGoToWaitlist` in real-time
   - Shows appropriate UI (button label, messages)
   - Submits RSVP data

2. **Backend** (`index.js` → `data.js`):

   - Validates email
   - Finds/creates person
   - Calculates party size (DPCS)
   - Checks capacities
   - Creates RSVP with status
   - Returns RSVP with status details

3. **Frontend** (`EventPage.jsx`):
   - Receives response
   - Shows appropriate toast message
   - Refetches event data for updated capacity

### RSVP Update Flow (Admin)

1. **Frontend** (`EventGuestsPage.jsx`):

   - Admin opens Edit Guest modal
   - System calculates if changes exceed capacity
   - Shows warning if over capacity
   - Submits updates with `forceConfirm` flag if needed

2. **Backend** (`index.js` → `data.js`):

   - Receives updates and `forceConfirm` flag
   - Calculates new party size
   - Checks capacities
   - Applies override if `forceConfirm === true`
   - Updates RSVP
   - Returns updated RSVP

3. **Frontend**:
   - Refetches guest list
   - Shows updated status and over-capacity indicators

---

## Supabase Migration Readiness

### ✅ What's Ready

1. **Data Model**: Fully defined and consistent across frontend/backend
2. **Business Logic**: All core logic implemented and tested
3. **API Structure**: Clean separation between data layer and API routes
4. **Error Handling**: Basic error handling in place
5. **Validation**: Email validation, capacity checks, etc.

### ⚠️ What Needs Migration

1. **Data Storage**: Currently in-memory arrays → needs Supabase tables
2. **Authentication**: Currently mock user → needs Supabase Auth
3. **User Isolation**: Events not tied to users → needs user_id foreign keys
4. **Data Persistence**: Data lost on restart → needs database
5. **Unique Constraints**: Slug uniqueness → needs database constraints

### 📋 Migration Checklist

#### Phase 1: Supabase Setup

- [ ] Create Supabase project
- [ ] Set up environment variables
- [ ] Create database schema (tables, indexes, constraints)
- [ ] Set up Supabase Auth

#### Phase 2: Data Layer Migration

- [ ] Replace `people` array with Supabase queries
- [ ] Replace `events` array with Supabase queries
- [ ] Replace `rsvps` array with Supabase queries
- [ ] Update all CRUD operations to use Supabase
- [ ] Add user_id foreign keys to events

#### Phase 3: Authentication

- [ ] Implement Supabase Auth in frontend
- [ ] Add protected routes with real auth checks
- [ ] Link events to authenticated users
- [ ] Add user profile management

#### Phase 4: Testing & Validation

- [ ] Test all CRUD operations
- [ ] Verify data integrity
- [ ] Test capacity calculations
- [ ] Test waitlist logic
- [ ] Test admin override
- [ ] Test check-in system

### 🎯 Recommendation

**YES, it's time to implement Supabase.**

**Reasons:**

1. ✅ **Feature Complete**: All core features are implemented and working
2. ✅ **Logic Stable**: Business logic is well-defined and tested
3. ✅ **Data Model Clear**: Data structures are consistent and documented
4. ⚠️ **Data Loss Risk**: In-memory storage means data is lost on restart
5. ⚠️ **No User Isolation**: Events aren't tied to users (security issue)
6. ⚠️ **No Persistence**: Can't deploy without database

**Next Steps:**

1. Create Supabase project
2. Design and create database schema
3. Migrate data layer incrementally (start with read operations)
4. Add authentication
5. Test thoroughly
6. Deploy

---

## Key Invariants

1. **DPCS Consistency**: `partySize = wantsDinner ? (dinnerPartySize + plusOnes) : (1 + plusOnes)`
2. **Cocktails-Only**: `cocktailsOnly = wantsDinner ? plusOnes : partySize`
3. **All-or-Nothing Waitlist**: If any capacity exceeded → entire booking waitlisted
4. **Pull-Up Limits**: `dinnerPullUpCount <= dinnerPartySize`, `cocktailOnlyPullUpCount <= plusOnes`
5. **Admin Override Preservation**: Over-capacity guests maintain CONFIRMED status

---

## Testing Scenarios

### Waitlist Scenarios

1. Cocktail full, dinner available → waitlist
2. Dinner full, cocktails available → waitlist
3. Both full → waitlist
4. Waitlist disabled + capacity exceeded → error
5. Dinner slot full, other slots available → waitlist for full slot

### Admin Override Scenarios

1. Confirm guest over cocktail capacity → success, shows "Over capacity" badge
2. Confirm guest over dinner capacity → success, shows "Over capacity" badge
3. Check in over-capacity guest → maintains CONFIRMED status
4. Update over-capacity guest → preserves override

### Capacity Display Scenarios

1. Overview shows correct over-capacity indicators
2. Dinner slots show correct confirmed counts
3. Pull-up counts display correctly per slot
4. All calculations use guest data (not stale API cache)

---

## Files Reference

### Backend Core

- `backend/src/data.js` - All business logic, DPCS, capacity checks, admin override
- `backend/src/index.js` - API routes, request handling

### Frontend Core

- `frontend/src/components/EventCard.jsx` - Public RSVP form
- `frontend/src/pages/EventPage.jsx` - Public event page, toast messages
- `frontend/src/pages/EventGuestsPage.jsx` - Guest list, edit modal, admin override UI
- `frontend/src/pages/ManageEventPage.jsx` - Event overview, over-capacity indicators
- `frontend/src/components/Toast.jsx` - Toast notifications with subtext support

---

**Status:** ✅ Feature Complete - Ready for Supabase Migration

**Next Major Milestone:** v3.0 → v4.0 (Supabase Integration + Authentication)
