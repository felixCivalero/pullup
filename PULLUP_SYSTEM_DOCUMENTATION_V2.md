# PullUp System Documentation v2.0

**Last Updated:** December 2024  
**Version:** 2.0  
**Status:** Production Ready

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Dynamic Party Composition System (DPCS)](#dynamic-party-composition-system-dpcs)
3. [RSVP Status Model](#rsvp-status-model)
4. [Data Structures](#data-structures)
5. [Frontend Routes](#frontend-routes)
6. [Backend API Routes](#backend-api-routes)
7. [Core Business Logic](#core-business-logic)
8. [Capacity Management](#capacity-management)
9. [Check-In System](#check-in-system)
10. [Full-Stack Data Flow](#full-stack-data-flow)

---

## System Overview

PullUp is a dynamic event management and RSVP system that enables flexible guest allocation for events with optional dinner components. The system's core innovation is the **Dynamic Party Composition System (DPCS)**, which allows seamless transitions between cocktail-only events and events with dinner, while maintaining accurate capacity tracking.

### Key Features

- **Flexible Guest Allocation**: Support for cocktail-only guests and dinner parties with additional cocktail guests
- **Dynamic Capacity Management**: Separate tracking for cocktail capacity and dinner slot capacity
- **Real-time Waitlist**: All-or-nothing waitlist system with clear user feedback
- **Check-In System**: Separate tracking for dinner and cocktails-only arrivals
- **CRM Integration**: Contact management with event history tracking

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

### Booking Status (Event-Level)

- **`CONFIRMED`**: Entire party has confirmed spots
- **`WAITLIST`**: Entire party is on waitlist (all-or-nothing)
- **`CANCELLED`**: Booking cancelled

### Dinner Booking Status (Dinner-Level)

- **`CONFIRMED`**: Dinner party has confirmed dinner seats
- **`WAITLIST`**: Dinner party is on waitlist
- **`null`**: No dinner booking

### Pull-Up Status (Derived from Arrival Counts)

- **`NONE`**: No one has arrived
- **`PARTIAL`**: Some guests have arrived
- **`FULL`**: All expected guests have arrived

**Rule**: If `bookingStatus !== "CONFIRMED"`, pull-up status is treated as `"NONE"` and non-zero pull-up counts are prevented.

---

## Data Structures

### RSVP Object

```typescript
type BookingStatus = "CONFIRMED" | "WAITLIST" | "CANCELLED";
type PullUpStatus = "NONE" | "PARTIAL" | "FULL"; // Derived

type Rsvp = {
  id: string;
  eventId: string;
  personId: string;

  // Overall party (calculated using DPCS)
  partySize: number; // Total unique guests

  // Event-level booking
  bookingStatus: BookingStatus;

  // Dinner sub-booking (optional)
  dinner: {
    enabled: boolean;
    partySize: number; // Includes booker when enabled
    slotTime: string | null; // ISO string
    bookingStatus: BookingStatus;
  } | null;

  // Check-in counts
  dinnerPullUpCount: number; // 0..dinner.partySize
  cocktailOnlyPullUpCount: number; // 0..plusOnes

  // Guest details
  plusOnes: number; // Cocktails-only guests
  name: string;
  email: string;

  // Backward compatibility fields
  status: "attending" | "waitlist" | "cancelled";
  wantsDinner: boolean;
  dinnerStatus: "confirmed" | "waitlist" | null;
  dinnerTimeSlot: string | null;
  dinnerPartySize: number | null;
  totalGuests: number; // Legacy, equals partySize
  pulledUpForDinner: number | null;
  pulledUpForCocktails: number | null;
};
```

### Event Object

```typescript
type Event = {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string; // ISO string
  startTime: string; // ISO string
  endTime: string; // ISO string

  // Capacity
  cocktailCapacity: number | null; // null = unlimited
  foodCapacity: number | null; // max seats per slot * number of slots
  totalCapacity: number | null; // cocktailCapacity + foodCapacity

  // Dinner settings
  dinnerEnabled: boolean;
  dinnerStartTime: string | null; // ISO string
  dinnerEndTime: string | null; // ISO string
  dinnerSeatingIntervalHours: number | null;
  dinnerMaxSeatsPerSlot: number | null;

  // Guest limits
  maxPlusOnesPerGuest: number; // 0-5

  // Waitlist
  waitlistEnabled: boolean;

  // Payments
  ticketType: "free" | "paid";
  ticketPrice: number | null;
  ticketCurrency: string | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
};
```

### Person Object

```typescript
type Person = {
  id: string;
  email: string; // Normalized (lowercase)
  name: string | null;
  createdAt: string; // ISO string
  stripeCustomerId: string | null; // For payment integration
};
```

---

## Frontend Routes

### Public Routes

| Route      | Component     | Description            |
| ---------- | ------------- | ---------------------- |
| `/`        | `LandingPage` | Public landing page    |
| `/e/:slug` | `EventPage`   | Public event RSVP page |

### Protected Routes (Host)

| Route                             | Component             | Description                                 |
| --------------------------------- | --------------------- | ------------------------------------------- |
| `/home`                           | `HomePage`            | Main dashboard with tabs                    |
| `/home/events`                    | `HomeEventsTab`       | Events list (default tab)                   |
| `/home/settings`                  | `HomeSettingsTab`     | User settings                               |
| `/home/crm`                       | `HomeCrmTab`          | Contact management                          |
| `/create`                         | `CreateEventPage`     | Create new event                            |
| `/app/events/:id/manage`          | `ManageEventPage`     | Manage event (tabs: Overview, Guests, Edit) |
| `/app/events/:id/manage/overview` | `OverviewTabContent`  | Event statistics                            |
| `/app/events/:id/manage/guests`   | `EventGuestsPage`     | Guest list and management                   |
| `/app/events/:id/manage/edit`     | `EditEventTabContent` | Edit event details                          |

---

## Backend API Routes

### Public Routes

| Method | Route                        | Description                            |
| ------ | ---------------------------- | -------------------------------------- |
| `GET`  | `/events/:slug`              | Get public event details with capacity |
| `POST` | `/events/:slug/rsvp`         | Create RSVP (uses DPCS)                |
| `GET`  | `/events/:slug/dinner-slots` | Get available dinner time slots        |

### Protected Routes (Host)

| Method   | Route                                 | Description                 |
| -------- | ------------------------------------- | --------------------------- |
| `GET`    | `/host/events`                        | Get all events for host     |
| `GET`    | `/host/events/:eventId`               | Get event details           |
| `POST`   | `/host/events`                        | Create new event            |
| `PUT`    | `/host/events/:eventId`               | Update event                |
| `DELETE` | `/host/events/:eventId`               | Delete event                |
| `GET`    | `/host/events/:eventId/rsvps`         | Get all RSVPs for event     |
| `PUT`    | `/host/events/:eventId/rsvps/:rsvpId` | Update RSVP (uses DPCS)     |
| `DELETE` | `/host/events/:eventId/rsvps/:rsvpId` | Delete RSVP                 |
| `GET`    | `/host/people`                        | Get all contacts with stats |
| `GET`    | `/host/people/:personId`              | Get person details          |

### Payment Routes

| Method | Route                       | Description                    |
| ------ | --------------------------- | ------------------------------ |
| `POST` | `/payments/create-checkout` | Create Stripe checkout session |
| `GET`  | `/payments/success`         | Payment success callback       |
| `POST` | `/webhooks/stripe`          | Stripe webhook handler         |

---

## Core Business Logic

### Creating an RSVP (`addRsvp`)

1. **Validate Inputs**

   - Email format validation
   - Check for duplicate RSVP
   - Clamp `plusOnes` to event limit

2. **Apply Dynamic Party Composition System**

   ```javascript
   const partySize = calculatePartySize(wantsDinner, dinnerPartySize, plusOnes);
   const cocktailsOnly = calculateCocktailsOnly(
     wantsDinner,
     partySize,
     plusOnes
   );
   ```

3. **Capacity Checks (All-or-Nothing)**

   - Check cocktail capacity: `currentCocktailsOnly + cocktailsOnly <= cocktailCapacity`
   - If dinner: Check dinner slot capacity: `dinnerPartySize <= availableSeats`
   - If either capacity exceeded → entire booking goes to `WAITLIST`

4. **Create RSVP Object**
   - Store `partySize` (calculated via DPCS)
   - Store `dinner.partySize` (includes booker if dinner enabled)
   - Store `plusOnes` (cocktails-only count)
   - Set `bookingStatus` and `dinner.bookingStatus`

### Updating an RSVP (`updateRsvp`)

1. **Update Fields**

   - Apply DPCS to recalculate `partySize`
   - Recalculate `cocktailsOnly` for capacity checks

2. **Re-run Capacity Checks**

   - Exclude current RSVP from existing counts
   - Check if updated booking fits capacity
   - Update `bookingStatus` accordingly

3. **Handle Pull-Up Counts**
   - If `bookingStatus !== "CONFIRMED"`, reset pull-up counts to 0
   - Validate pull-up counts don't exceed limits

### Capacity Calculations

#### Cocktail Capacity

```javascript
function getCocktailsOnlyCount(eventId) {
  return rsvps
    .filter((r) => r.eventId === eventId && r.bookingStatus === "CONFIRMED")
    .reduce((sum, r) => {
      return (
        sum +
        calculateCocktailsOnly(
          r.dinner?.enabled || false,
          r.partySize,
          r.plusOnes ?? 0
        )
      );
    }, 0);
}

const cocktailSpotsLeft = cocktailCapacity - getCocktailsOnlyCount(eventId);
```

#### Dinner Capacity (Per Slot)

```javascript
function getDinnerSlotCounts(eventId, slotTime) {
  return rsvps
    .filter(
      (r) =>
        r.eventId === eventId &&
        r.dinner?.slotTime === slotTime &&
        r.dinner?.bookingStatus === "CONFIRMED"
    )
    .reduce((sum, r) => sum + (r.dinner?.partySize || 0), 0);
}

const slotRemaining = slotCapacity - getDinnerSlotCounts(eventId, slotTime);
```

---

## Capacity Management

### Event Capacity Fields

- **`cocktailCapacity`**: Maximum cocktails-only guests
- **`foodCapacity`**: Maximum dinner guests (calculated: `slots * maxSeatsPerSlot`)
- **`totalCapacity`**: `cocktailCapacity + foodCapacity` (informational)

### Capacity Calculation During RSVP

1. **Cocktail Capacity Check**

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

2. **Dinner Capacity Check**

   ```javascript
   const slotCounts = getDinnerSlotCounts(eventId, dinnerTimeSlot);
   const availableSeats = slotCapacity - slotCounts.confirmed;

   if (dinnerPartySize > availableSeats) {
     dinnerBookingStatus = "WAITLIST";
     bookingStatus = "WAITLIST"; // All-or-nothing
   }
   ```

### Real-Time Capacity Display

- Public event page shows `cocktailSpotsLeft` and `dinnerSlot.remaining`
- Frontend calculates `willGoToWaitlist` before submission
- Button text changes to "Join Waitlist" if capacity exceeded

---

## Check-In System

### Pull-Up Counts

- **`dinnerPullUpCount`**: Number of dinner guests who have arrived (0..`dinner.partySize`)
- **`cocktailOnlyPullUpCount`**: Number of cocktails-only guests who have arrived (0..`plusOnes`)

### Pull-Up Status Derivation

```typescript
const dinnerSize = dinner?.partySize || 0;
const cocktailOnlyMax = plusOnes;
const totalExpected = dinnerSize + cocktailOnlyMax;
const totalArrived = dinnerPullUpCount + cocktailOnlyPullUpCount;

let pullUpStatus: PullUpStatus;
if (totalArrived === 0) {
  pullUpStatus = "NONE";
} else if (totalArrived > 0 && totalArrived < totalExpected) {
  pullUpStatus = "PARTIAL";
} else if (totalArrived === totalExpected) {
  pullUpStatus = "FULL";
}
```

### Check-In Rules

1. **Only CONFIRMED bookings can have pull-up counts > 0**
2. **Pull-up counts cannot exceed their respective maximums**
3. **Updating booking status to WAITLIST/CANCELLED resets pull-up counts**

### Check-In UI

- **Guests List**: Shows pull-up status badge ("haven't pulled up", "x/x pulled up", "all pulled up")
- **Edit Guest Modal**: Allows updating `dinnerPullUpCount` and `cocktailOnlyPullUpCount`
- **Overview Tab**: Shows aggregate pull-up statistics

---

## Full-Stack Data Flow

### RSVP Creation Flow

```
User fills RSVP form
  ↓
Frontend calculates partySize using DPCS
  ↓
Frontend shows real-time capacity feedback
  ↓
POST /events/:slug/rsvp
  ↓
Backend addRsvp() applies DPCS
  ↓
Backend checks capacity (all-or-nothing)
  ↓
Backend creates RSVP with calculated partySize
  ↓
Response includes bookingStatus and dinnerBookingStatus
  ↓
Frontend displays success/waitlist message
  ↓
Frontend refreshes capacity data
```

### Guest Check-In Flow

```
Admin clicks guest row
  ↓
EditGuestModal opens with current pull-up counts
  ↓
Admin updates dinnerPullUpCount and/or cocktailOnlyPullUpCount
  ↓
PUT /host/events/:eventId/rsvps/:rsvpId
  ↓
Backend updateRsvp() validates counts
  ↓
Backend updates RSVP
  ↓
Response includes updated RSVP
  ↓
Frontend refreshes guest list
  ↓
Pull-up status badge updates
```

### Event Capacity Display Flow

```
GET /events/:slug
  ↓
Backend calculates _attendance:
  - confirmed: count of CONFIRMED RSVPs
  - waitlist: count of WAITLIST RSVPs
  - cocktailSpotsLeft: cocktailCapacity - getCocktailsOnlyCount()
  ↓
Frontend displays capacity info
  ↓
Frontend calculates willGoToWaitlist before submission
  ↓
Frontend shows warning if capacity exceeded
```

---

## Key Invariants

1. **DPCS Invariant**: `partySize = wantsDinner ? (dinnerPartySize + plusOnes) : (1 + plusOnes)`
2. **Cocktails-Only Invariant**: `cocktailsOnly = wantsDinner ? plusOnes : partySize`
3. **Dinner Invariant**: If `dinner !== null`, then `dinner.enabled === true` and `dinner.partySize >= 1`
4. **Pull-Up Invariant**: If `bookingStatus !== "CONFIRMED"`, then `dinnerPullUpCount === 0` and `cocktailOnlyPullUpCount === 0`
5. **Capacity Invariant**: `cocktailsOnly <= cocktailCapacity` and `dinnerPartySize <= slotCapacity` for confirmed bookings

---

## Migration Notes

### From Legacy Model

- **Old**: `partySize` was `max(1 + plusOnes, dinnerPartySize)`
- **New**: `partySize` uses DPCS (additive, not maximum)
- **Old**: `totalGuests` was calculated separately
- **New**: `totalGuests === partySize` (legacy field for compatibility)

### Backward Compatibility

- Legacy fields (`status`, `dinnerStatus`, `totalGuests`, etc.) are derived from new model
- Old RSVPs are migrated on-the-fly during reads
- New code should use `bookingStatus`, `dinner.bookingStatus`, `partySize`

---

## Testing Scenarios

### Scenario 1: No Dinner, No Guests

- Input: `plusOnes = 0`, `wantsDinner = false`
- Expected: `partySize = 1`, `cocktailsOnly = 1`

### Scenario 2: No Dinner, +2 Guests

- Input: `plusOnes = 2`, `wantsDinner = false`
- Expected: `partySize = 3`, `cocktailsOnly = 3`

### Scenario 3: Dinner for 1, No Guests

- Input: `dinnerPartySize = 1`, `plusOnes = 0`, `wantsDinner = true`
- Expected: `partySize = 1`, `cocktailsOnly = 0`, `dinner = 1`

### Scenario 4: Dinner for 4, +3 Guests

- Input: `dinnerPartySize = 4`, `plusOnes = 3`, `wantsDinner = true`
- Expected: `partySize = 7`, `cocktailsOnly = 3`, `dinner = 4`

### Scenario 5: Capacity Exceeded

- Input: `cocktailCapacity = 10`, `currentCocktailsOnly = 8`, `plusOnes = 3`, `wantsDinner = false`
- Expected: `bookingStatus = "WAITLIST"` (all-or-nothing)

---

## Future Considerations

### Database Migration

When moving to Supabase, ensure:

- `partySize` is stored (not calculated)
- `dinner.partySize` is stored (includes booker)
- `plusOnes` is stored (cocktails-only count)
- Indexes on `eventId`, `bookingStatus`, `dinner.slotTime`

### Performance Optimizations

- Cache capacity calculations
- Batch capacity updates
- Consider materialized views for statistics

### Feature Enhancements

- Partial waitlist (allow cocktail-only if dinner full)
- Transfer RSVPs between events
- Bulk check-in operations
- Export guest lists

---

## Conclusion

The **Dynamic Party Composition System (DPCS)** is the core innovation that makes PullUp unique. It enables seamless transitions between cocktail-only events and events with dinner, while maintaining accurate capacity tracking. This system is **critical** and should be preserved in all future iterations.

**Key Takeaway**: The booker is automatically included in `dinnerPartySize` when dinner is selected, allowing dinner parties to have additional cocktails-only guests added on top.

---

_Document Version: 2.0_  
_Last Updated: December 2024_  
_Maintained by: PullUp Development Team_
