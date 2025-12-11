# Full-Stack Flow Audit

This document maps all frontend interactions to backend API routes to data.js functions, showing the complete flow of data through the application.

---

## 📋 RSVP Status Model (Source of Truth)

**Important:** `"Pull up"` **is** arrival / check-in status. There is **no** separate `arrivalStatus` type. The axes are:

- **Booking Status** – reservation-level state
- **Pull-Up State** – derived from arrival counts (how many have actually shown up)

There are **two layers of booking**:

1. **Event-level booking** for the whole party
2. **Dinner-level booking** for the subset that has dinner seats

And there are **two separate arrival counters**:

- How many dinner guests have arrived
- How many cocktails-only guests have arrived

### RSVP Data Structure

```typescript
type BookingStatus = "CONFIRMED" | "WAITLIST" | "CANCELLED";

type PullUpStatus = "NONE" | "PARTIAL" | "FULL"; // Derived from arrival counts

type Rsvp = {
  id: string;
  eventId: string;
  personId: string;

  // Overall party
  partySize: number; // total people this RSVP covers (booker + plus-ones)

  // Event-level booking for the whole party
  bookingStatus: BookingStatus; // CONFIRMED | WAITLIST | CANCELLED

  // Dinner sub-booking (optional, for a subset of the party)
  dinner: {
    enabled: boolean;
    partySize: number; // guests booked for dinner out of partySize
    slotTime: string | null; // ISO string for dinner slot
    bookingStatus: BookingStatus; // dinner-specific booking state
  } | null;

  // Check-in / "pull up" counts
  // How many *dinner* guests from this RSVP have actually arrived
  dinnerPullUpCount: number; // 0..(dinner?.partySize or 0)

  // How many *non-dinner* (cocktails-only) guests from this RSVP have arrived
  cocktailOnlyPullUpCount: number; // 0..getCocktailOnlyMax(this RSVP)
};
```

### Derived Party Sizes

Helper functions to calculate party sizes:

```typescript
function getDinnerPartySize(r: Rsvp): number {
  return r.dinner?.enabled ? r.dinner.partySize : 0;
}

function getCocktailOnlyMax(r: Rsvp): number {
  const dinnerSize = getDinnerPartySize(r);
  return Math.max(r.partySize - dinnerSize, 0);
}
```

**Invariants:**

- If `dinner === null` → no dinner booking
- If `dinner !== null` → `dinner.enabled` must be `true`

### Pull-Up Status Derivation

**Overall Pull-Up Status** (derived from both counters):

Explicit derivation:

```typescript
const dinnerSize = getDinnerPartySize(r);
const cocktailOnlyMax = getCocktailOnlyMax(r);
const totalExpected = dinnerSize + cocktailOnlyMax; // usually === partySize
const totalArrived = r.dinnerPullUpCount + r.cocktailOnlyPullUpCount;
```

**Rule:** If `bookingStatus !== "CONFIRMED"`, treat pull-up status as `"NONE"` in the UI and prevent non-zero pull-up counts in the backend.

Otherwise:

- **`PullUpStatus: "NONE"`** → `totalArrived === 0`
- **`PullUpStatus: "PARTIAL"`** → `totalArrived > 0 && totalArrived < totalExpected`
- **`PullUpStatus: "FULL"`** → `totalArrived === totalExpected`

**Dinner Pull-Up Status** (if dinner enabled):

- **`PullUpStatus: "NONE"`** → `dinnerPullUpCount === 0`
- **`PullUpStatus: "PARTIAL"`** → `0 < dinnerPullUpCount < dinner.partySize`
- **`PullUpStatus: "FULL"`** → `dinnerPullUpCount === dinner.partySize`

**Cocktails-Only Pull-Up Status**:

Let `cocktailOnlyMax = getCocktailOnlyMax(r)`:

- **`PullUpStatus: "NONE"`** → `cocktailOnlyPullUpCount === 0`
- **`PullUpStatus: "PARTIAL"`** → `0 < cocktailOnlyPullUpCount < cocktailOnlyMax`
- **`PullUpStatus: "FULL"`** → `cocktailOnlyPullUpCount === cocktailOnlyMax`

---

---

## 📋 Table of Contents

1. [RSVP Status Model (Source of Truth)](#-rsvp-status-model-source-of-truth)
2. [Frontend Routes Summary](#frontend-routes-summary)
3. [Public Routes](#public-routes)
4. [Host/Protected Routes](#hostprotected-routes)
5. [Payment Routes](#payment-routes)
6. [Webhook Routes](#webhook-routes)
7. [Data Functions Reference](#data-functions-reference)

---

## 🗺️ Frontend Routes Summary

### Public Routes (No Authentication Required)

- `/` → `LandingPage.jsx` - Landing page
- `/e/:slug` → `EventPage.jsx` - Public event page with RSVP form

### Protected Routes (Requires Authentication - Wrapped in `ProtectedLayout`)

- `/home` → `HomePage.jsx` - Dashboard with tabs (Events, Settings, Integrations, CRM)
- `/create` → `CreateEventPage.jsx` - Create new event
- `/app/events/:id/manage` → `ManageEventPage.jsx` - Manage event (Overview, Guests, Edit tabs)
- `/app/events/:id/guests` → `EventGuestsPage.jsx` - Guest list with check-in functionality

**Note:** Currently, `ProtectedLayout` doesn't enforce authentication (no auth middleware), but routes are structured for future auth implementation.

---

## 🌐 Public Routes

### `GET /events`

**Purpose:** List all events  
**Backend Function:** Returns `events` array directly  
**Frontend Route:** `/home` (Protected)  
**Frontend Usage:**

- **Page:** `HomePage.jsx`
- **Function:** `loadEvents()` (line ~162)
- **When:** On component mount, loads all events for home dashboard
- **Updates:** `setEvents(data)`

**Flow:**

```
HomePage.jsx → GET /events → events array → Display in HomeEventsTab
```

---

### `GET /events/:slug`

**Purpose:** Get single event by slug (public event page)  
**Backend Functions:**

- `findEventBySlug(slug)`
- `getEventCounts(event.id)` → Returns `{ confirmed, waitlist }`
  - `confirmed` = RSVPs with `bookingStatus === "CONFIRMED"` (or legacy `status === "attending"`)
  - `waitlist` = RSVPs with `bookingStatus === "WAITLIST"` (or legacy `status === "waitlist"`)
- `getCocktailsOnlyCount(event.id)` → Returns cocktails-only count

**Frontend Route:** `/e/:slug` (Public)  
**Frontend Usage:**

- **Page:** `EventPage.jsx`
- **Function:** `useEffect` (line ~31) - loads event on mount
- **Function:** `handleRsvpSubmit` (line ~187) - refetches after RSVP
- **Updates:** `setEvent(updatedEvent)`

**Response Structure:**

```json
{
  ...event,
  _attendance: {
    confirmed: number,        // RSVPs with bookingStatus: "CONFIRMED" (or legacy status: "attending")
    waitlist: number,         // RSVPs with bookingStatus: "WAITLIST" (or legacy status: "waitlist")
    cocktailSpotsLeft: number
  }
}
```

**Flow:**

```
EventPage.jsx → GET /events/:slug → findEventBySlug() + getEventCounts() + getCocktailsOnlyCount() → Display event + capacity
```

---

### `POST /events`

**Purpose:** Create new event  
**Backend Functions:**

- `createEvent({ ... })` → Creates event in memory
- `createStripeProduct()` → If paid event (from stripe.js)
- `createStripePrice()` → If paid event (from stripe.js)
- `updateEvent(event.id, { stripeProductId, stripePriceId })` → Updates with Stripe IDs

**Frontend Route:** `/create` (Protected)  
**Frontend Usage:**

- **Page:** `CreateEventPage.jsx`
- **Function:** `handleSubmit` (line ~476)
- **When:** User submits event creation form
- **Updates:** Navigates to `/app/events/${data.id}/manage` on success

**Request Body:**

```javascript
{
  title,
    description,
    location,
    startsAt,
    endsAt,
    timezone,
    maxAttendees,
    waitlistEnabled,
    imageUrl,
    theme,
    calendar,
    visibility,
    ticketType,
    requireApproval,
    maxPlusOnesPerGuest,
    dinnerEnabled,
    dinnerStartTime,
    dinnerEndTime,
    dinnerSeatingIntervalHours,
    dinnerMaxSeatsPerSlot,
    dinnerOverflowAction,
    cocktailCapacity,
    foodCapacity,
    totalCapacity,
    ticketPrice,
    ticketCurrency,
    stripeProductId,
    stripePriceId;
}
```

**Flow:**

```
CreateEventPage.jsx → POST /events → createEvent() → [If paid: createStripeProduct() + createStripePrice() + updateEvent()] → Navigate to manage page
```

---

### `POST /events/:slug/rsvp`

**Purpose:** Public RSVP to event  
**Backend Functions:**

- `findEventBySlug(slug)`
- `findOrCreatePerson(email, name)` → Creates person if doesn't exist
- `addRsvp({ slug, name, email, plusOnes, wantsDinner, dinnerTimeSlot, dinnerPartySize })` → Creates RSVP
  - Uses `calculateTotalGuests()` internally (legacy helper)
  - Checks capacity using `getEventCounts()` and `getDinnerSlotCounts()`
  - Sets `bookingStatus` based on capacity: "CONFIRMED" | "WAITLIST" (event-level booking)
  - Initializes `dinnerPullUpCount: 0` and `cocktailOnlyPullUpCount: 0` (arrival counters start at 0)
  - **Dinner block mapping:**
    - If `wantsDinner === true` and `dinnerTimeSlot` and `dinnerPartySize` are provided:
      - `dinner = { enabled: true, partySize: dinnerPartySize, slotTime: dinnerTimeSlot, bookingStatus: "CONFIRMED" | "WAITLIST" }` (based on dinner capacity)
    - Else:
      - `dinner = null`

**Frontend Route:** `/e/:slug` (Public)  
**Frontend Usage:**

- **Page:** `EventPage.jsx`
- **Component:** `EventCard.jsx` (RSVP form)
- **Function:** `handleRsvpSubmit` (line ~112 in EventPage.jsx)
- **When:** User submits RSVP form on public event page

**Request Body:**

```javascript
{
  name: string,
  email: string,
  plusOnes: number (0-3),
  wantsDinner: boolean,
  dinnerTimeSlot: string (ISO) | null,
  dinnerPartySize: number | null
}
```

**Response:**

```json
{
  event: Event,
  rsvp: RSVP,
  statusDetails: {
    bookingStatus: "CONFIRMED" | "WAITLIST",  // Event-level booking status
    dinnerBookingStatus: "CONFIRMED" | "WAITLIST" | null,  // Dinner-level booking status
    wantsDinner: boolean,
    // Backward compatibility fields
    cocktailStatus: "attending" | "waitlist",
    dinnerStatus: "confirmed" | "waitlist" | "cocktails" | "cocktails_waitlist" | null
  }
}
```

**Legacy Status Mapping** (for old components):

- `bookingStatus === "CONFIRMED"` → `cocktailStatus = "attending"`
- `bookingStatus === "WAITLIST"` → `cocktailStatus = "waitlist"`

- If `wantsDinner === false`:
  - `dinnerStatus = "cocktails"` or `"cocktails_waitlist"` depending on `bookingStatus`
- If `wantsDinner === true` and `dinner.bookingStatus === "CONFIRMED"`:
  - `dinnerStatus = "confirmed"`
- If `wantsDinner === true` and `dinner.bookingStatus === "WAITLIST"`:
  - `dinnerStatus = "waitlist"`

**Note:** New UI should ignore `cocktailStatus`/`dinnerStatus` and use `bookingStatus` + `dinner.bookingStatus` instead.

**RSVP Structure (after creation):**

```typescript
{
  id: string,
  eventId: string,
  personId: string,
  partySize: number,              // booker + plusOnes
  bookingStatus: "CONFIRMED" | "WAITLIST" | "CANCELLED",  // Event-level booking
  dinnerPullUpCount: number,      // 0 initially (dinner guests who have arrived)
  cocktailOnlyPullUpCount: number, // 0 initially (cocktails-only guests who have arrived)
  dinner: {
    enabled: boolean,
    partySize: number,            // guests booked for dinner
    slotTime: string | null,     // ISO string for dinner slot
    bookingStatus: "CONFIRMED" | "WAITLIST" | "CANCELLED"  // Dinner-level booking
  } | null
}
```

**Flow:**

```
EventCard.jsx → EventPage.jsx → POST /events/:slug/rsvp → findEventBySlug() → findOrCreatePerson() → addRsvp() → Returns statusDetails with bookingStatus → Show toast → Refetch event
```

---

### `GET /events/:slug/dinner-slots`

**Purpose:** Get dinner time slots with availability  
**Backend Functions:**

- `findEventBySlug(slug)`
- `generateDinnerTimeSlots(event)` → Generates time slots array
- `getDinnerSlotCounts(event.id)` → Returns `{ [slotTime]: { confirmed, waitlist } }` (based on dinner.bookingStatus)

**Frontend Routes:**

- `/e/:slug` (Public) - Used by `EventPage.jsx` → `EventCard.jsx`
- `/app/events/:id/manage` (Protected) - Used by `ManageEventPage.jsx`
- `/app/events/:id/guests` (Protected) - Used by `EventGuestsPage.jsx`

**Frontend Usage:**

- **Page:** `EventPage.jsx` → `EventCard.jsx`
- **Function:** `useEffect` (line ~67 in EventCard.jsx) - loads slots when event has dinner enabled
- **Page:** `ManageEventPage.jsx`
- **Function:** `useEffect` (line ~698) - loads slots for Overview tab
- **Page:** `EventGuestsPage.jsx`
- **Function:** `useEffect` (line ~74) - loads slots for guest list

**Response:**

```json
{
  slots: [
    {
      time: "ISO string",
      available: boolean,
      remaining: number | null,
      confirmed: number,
      waitlist: number
    }
  ],
  maxSeatsPerSlot: number
}
```

**Flow:**

```
EventCard.jsx / ManageEventPage.jsx / EventGuestsPage.jsx → GET /events/:slug/dinner-slots → findEventBySlug() + generateDinnerTimeSlots() + getDinnerSlotCounts() → Display slots with availability
```

---

## 🔐 Host/Protected Routes

### `GET /host/events/:id`

**Purpose:** Get event by ID (host view)  
**Backend Function:** `findEventById(id)`  
**Frontend Route:** `/app/events/:id/manage` (Protected)  
**Frontend Usage:**

- **Page:** `ManageEventPage.jsx`
- **Function:** `useEffect` (line ~607) - loads event on mount
- **Updates:** `setEvent(data)`

**Flow:**

```
ManageEventPage.jsx → GET /host/events/:id → findEventById() → Load event for editing
```

---

### `PUT /host/events/:id`

**Purpose:** Update event  
**Backend Function:** `updateEvent(id, updates)`  
**Frontend Route:** `/app/events/:id/manage` (Protected)  
**Frontend Usage:**

- **Page:** `ManageEventPage.jsx`
- **Function:** `handleSubmit` (line ~948)
- **When:** User saves event changes in Edit tab
- **Updates:** Refetches event data

**Request Body:** Same fields as POST /events (all event fields)

**Flow:**

```
ManageEventPage.jsx → PUT /host/events/:id → updateEvent() → Event updated in memory → Refetch event
```

---

### `GET /host/events/:id/guests`

**Purpose:** Get guest list for event  
**Backend Functions:**

- `findEventById(id)`
- `getRsvpsForEvent(event.id)` → Returns enriched RSVPs with person data

**Frontend Routes:**

- `/app/events/:id/guests` (Protected) - Used by `EventGuestsPage.jsx`
- `/app/events/:id/manage` (Protected) - Used by `ManageEventPage.jsx` (Overview tab)

**Frontend Usage:**

- **Page:** `EventGuestsPage.jsx`
- **Function:** `useEffect` (line ~65) - loads guests on mount
- **Function:** `handleUpdateGuest` (line ~203) - refetches after update
- **Function:** `handleDeleteGuest` (line ~231) - refetches after delete
- **Function:** `persistPulledUpChange` (line ~289) - refetches on error
- **Function:** `onSave` in PulledUpModal (line ~1378) - refetches after save
- **Function:** `flushAndRefetch` (line ~155) - refetches when tab becomes visible
- **Page:** `ManageEventPage.jsx`
- **Function:** `useEffect` (line ~689) - loads guests for Overview tab

**Response:**

```json
{
  event: Event,
  guests: Array<EnrichedRSVP> // RSVP + person data
}
```

**Flow:**

```
EventGuestsPage.jsx / ManageEventPage.jsx → GET /host/events/:id/guests → findEventById() + getRsvpsForEvent() → Display guest list
```

---

### `PUT /host/events/:eventId/rsvps/:rsvpId`

**Purpose:** Update guest RSVP (including booking status and check-in status)  
**Backend Functions:**

- `findEventById(eventId)`
- `findRsvpById(rsvpId)`
- `updateRsvp(rsvpId, updates)` → Updates RSVP
  - Uses `calculateTotalGuests()` internally (legacy helper)
  - Checks capacity using `getEventCounts()` and `getDinnerSlotCounts()`
  - Updates `bookingStatus`: "CONFIRMED" | "WAITLIST" | "CANCELLED" (event-level)
  - **Dinner block mapping:**
    - If `wantsDinner === false`:
      - `dinner = null`
      - `dinnerPullUpCount = 0`
    - If `wantsDinner === true`:
      - Ensure `dinner` is not null and `dinner.enabled = true`
      - `dinner.partySize = dinnerPartySize`
      - `dinner.slotTime = dinnerTimeSlot`
      - If `"dinner.bookingStatus"` is provided, update `dinner.bookingStatus`
  - Updates `dinnerPullUpCount` (dinner arrival count, max = `getDinnerPartySize(r)`)
  - Updates `cocktailOnlyPullUpCount` (cocktails-only arrival count, max = `getCocktailOnlyMax(r)`)
  - Validates pull-up counts don't exceed party sizes
  - **Rule:** If `bookingStatus !== "CONFIRMED"`, prevent non-zero pull-up counts

**Frontend Route:** `/app/events/:id/guests` (Protected)  
**Frontend Usage:**

- **Page:** `EventGuestsPage.jsx`
- **Function:** `handleUpdateGuest` (line ~188) - updates guest info (name, email, plus-ones, bookingStatus, dinner)
- **Function:** `onSave` in PulledUpModal (line ~1361) - updates pull-up (check-in) status (with loading state)

**Request Body:**

```javascript
{
  name?: string,
  email?: string,
  plusOnes?: number,
  bookingStatus?: "CONFIRMED" | "WAITLIST" | "CANCELLED",  // Event-level booking
  wantsDinner?: boolean,
  dinnerTimeSlot?: string | null,
  dinnerPartySize?: number | null,
  "dinner.bookingStatus"?: "CONFIRMED" | "WAITLIST" | "CANCELLED",  // Dinner-level booking
  dinnerPullUpCount?: number,              // Dinner guests who have arrived (0 to getDinnerPartySize(r))
  cocktailOnlyPullUpCount?: number         // Cocktails-only guests who have arrived (0 to getCocktailOnlyMax(r))
}
```

**Check-In Flow Details:**

1. **Dinner Pull-Up (Check-In) Status (`dinnerPullUpCount`):**

   - Tracks how many people from the dinner party have actually arrived/checked in
   - Max value = `getDinnerPartySize(r)` (uses helper function, returns `dinner?.partySize` or `0`)
   - Only applicable if `dinner.enabled === true` and `dinner.partySize > 0`
   - Each RSVP has ONE `dinner.slotTime`, so check-ins are tracked per RSVP
   - In Overview tab, per-slot totals are calculated by filtering RSVPs by `dinner.slotTime` and summing their `dinnerPullUpCount` values
   - **Rule:** If `bookingStatus !== "CONFIRMED"`, prevent non-zero `dinnerPullUpCount` in backend

2. **Cocktails-Only Pull-Up (Check-In) Status (`cocktailOnlyPullUpCount`):**

   - Tracks how many people from the cocktails-only portion have arrived
   - Max value = `getCocktailOnlyMax(r)` (uses helper function)
   - For guests with dinner: Max = `getCocktailOnlyMax(r)` (uses helper function)
   - For guests without dinner: Max = `getCocktailOnlyMax(r)` (uses helper function, equals `partySize`)
   - Example: If someone has 7 total guests (1 booker + 2 plus-ones + 4 dinner party), then max cocktails-only = 3
   - **Rule:** If `bookingStatus !== "CONFIRMED"`, prevent non-zero `cocktailOnlyPullUpCount` in backend

3. **Per-Slot Tracking:**
   - Each RSVP is tied to ONE `dinner.slotTime` (e.g., "2024-01-15T19:00:00Z")
   - Check-ins are tracked at the RSVP level, not per individual slot time
   - The Overview tab aggregates per slot by filtering RSVPs: `guests.filter(g => g.dinner?.slotTime === slot.time && g.dinnerPullUpCount > 0)`
   - This allows tracking: "3 people from the 7:00 PM slot have pulled up" vs "0 people from the 9:00 PM slot"

**Flow:**

```
EventGuestsPage.jsx → User clicks row → PulledUpModal opens
→ User enters pull-up counts → Clicks Save
→ PUT /host/events/:eventId/rsvps/:rsvpId
→ findEventById() + findRsvpById() + updateRsvp()
→ updateRsvp() validates and stores dinnerPullUpCount and cocktailOnlyPullUpCount
→ Returns updated RSVP → Refetch guests → Update table display
→ Overview tab shows per-slot totals by filtering guests by dinner.slotTime and summing dinnerPullUpCount
```

---

### `DELETE /host/events/:eventId/rsvps/:rsvpId`

**Purpose:** Delete guest RSVP  
**Backend Functions:**

- `findEventById(eventId)`
- `findRsvpById(rsvpId)`
- `deleteRsvp(rsvpId)` → Removes RSVP from array

**Frontend Route:** `/app/events/:id/guests` (Protected)  
**Frontend Usage:**

- **Page:** `EventGuestsPage.jsx`
- **Function:** `handleDeleteGuest` (line ~216)
- **When:** User confirms deletion in DeleteConfirmModal
- **Updates:** Refetches guests list

**Flow:**

```
EventGuestsPage.jsx → DELETE /host/events/:eventId/rsvps/:rsvpId → findEventById() + findRsvpById() + deleteRsvp() → RSVP deleted → Refetch guests
```

---

### `GET /host/crm/people`

**Purpose:** Get all people with CRM stats  
**Backend Function:** `getAllPeopleWithStats()` → Returns people with:

- Event history
- Total events with bookingStatus: "CONFIRMED"
- Total events with bookingStatus: "WAITLIST"
- Total guests brought
- Total dinners
- Total dinner guests

**Frontend Route:** `/home?tab=crm` (Protected)  
**Frontend Usage:**

- **Component:** `HomeCrmTab.jsx` (rendered in `HomePage.jsx`)
- **Function:** `useEffect` (line ~37) - loads people on mount
- **Updates:** `setPeople(data.people)`

**Response:**

```json
{
  people: Array<PersonWithStats>
}
```

**Flow:**

```
HomeCrmTab.jsx → GET /host/crm/people → getAllPeopleWithStats() → Display CRM list
```

---

### `PUT /host/crm/people/:personId`

**Purpose:** Update person/contact info  
**Backend Function:** `updatePerson(personId, updates)`  
**Frontend Route:** Not currently used  
**Frontend Usage:** Not currently used in frontend

**Request Body:**

```javascript
{
  name?: string,
  phone?: string,
  notes?: string,
  tags?: string[]
}
```

---

## 💳 Payment Routes

### `POST /host/events/:eventId/create-payment`

**Purpose:** Create Stripe payment intent  
**Backend Functions:**

- `findEventById(eventId)`
- `getOrCreateStripeCustomer(email, name)` → Creates/retrieves Stripe customer (from stripe.js)
- `findPersonByEmail(email)`
- `createPaymentIntent({ ... })` → Creates Stripe PaymentIntent (from stripe.js)
- `createPayment({ ... })` → Creates payment record in memory

**Frontend Route:** Not currently implemented  
**Frontend Usage:** Not currently implemented in frontend (backend ready)

**Flow:**

```
[Future] → POST /host/events/:eventId/create-payment → findEventById() + getOrCreateStripeCustomer() + createPaymentIntent() + createPayment() → Returns client_secret
```

---

### `GET /host/payments`

**Purpose:** Get payments for user  
**Backend Function:** `getPaymentsForUser(userId)`  
**Frontend Route:** Not currently used  
**Frontend Usage:** Not currently used

---

### `GET /host/events/:eventId/payments`

**Purpose:** Get payments for event  
**Backend Function:** `getPaymentsForEvent(eventId)`  
**Frontend Route:** Not currently used  
**Frontend Usage:** Not currently used

---

## 🔔 Webhook Routes

### `POST /webhooks/stripe`

**Purpose:** Handle Stripe webhooks  
**Backend Functions:**

- `handleStripeWebhook(event)` → Processes webhook (from stripe.js)
  - Calls `updatePayment()` for payment status updates
  - Handles `payment_intent.succeeded`, `payment_intent.failed`, `charge.refunded`

**Frontend Usage:** Not used (Stripe calls this directly)

**Flow:**

```
Stripe → POST /webhooks/stripe → handleStripeWebhook() → updatePayment() → Payment status updated
```

---

## 📊 Data Functions Reference

### Event Functions

- `createEvent({ ... })` - Creates new event
- `findEventBySlug(slug)` - Find event by slug
- `findEventById(id)` - Find event by ID
- `updateEvent(id, updates)` - Update event fields
- `getEventCounts(eventId)` - Get confirmed/waitlist counts (based on bookingStatus)
- `getCocktailsOnlyCount(eventId)` - Get cocktails-only count
- `generateDinnerTimeSlots(event)` - Generate dinner time slots
- `getDinnerSlotCounts(eventId)` - Get counts per dinner slot
- `getDinnerCounts(eventId)` - Get total dinner counts

### Person Functions

- `findOrCreatePerson(email, name)` - Find or create person
- `findPersonById(personId)` - Find person by ID
- `findPersonByEmail(email)` - Find person by email
- `updatePerson(personId, updates)` - Update person info
- `updatePersonStripeCustomerId(personId, stripeCustomerId)` - Link Stripe customer
- `getAllPeopleWithStats()` - Get all people with CRM stats

### RSVP Functions

- `addRsvp({ slug, name, email, plusOnes, wantsDinner, dinnerTimeSlot, dinnerPartySize })` - Create RSVP
  - Sets `bookingStatus`: "CONFIRMED" | "WAITLIST" based on capacity (event-level booking)
  - Initializes `dinnerPullUpCount: 0` and `cocktailOnlyPullUpCount: 0` (arrival counters)
  - Creates `dinner` object if dinner enabled with `bookingStatus` (dinner-level booking) and `partySize`
- `getRsvpsForEvent(eventId)` - Get all RSVPs for event (enriched with person data)
- `findRsvpById(rsvpId)` - Find RSVP by ID
- `updateRsvp(rsvpId, updates)` - Update RSVP
  - Updates `bookingStatus`: "CONFIRMED" | "WAITLIST" | "CANCELLED" (event-level)
  - Updates `dinner.bookingStatus` if dinner enabled (dinner-level)
  - Updates `dinnerPullUpCount` (dinner arrival count, max = `getDinnerPartySize(r)`)
  - Updates `cocktailOnlyPullUpCount` (cocktails-only arrival count, max = `getCocktailOnlyMax(r)`)
  - Validates pull-up counts don't exceed party sizes
- `deleteRsvp(rsvpId)` - Delete RSVP

### Payment Functions

- `createPayment({ ... })` - Create payment record
- `findPaymentById(paymentId)` - Find payment by ID
- `findPaymentByStripePaymentIntentId(intentId)` - Find by Stripe intent ID
- `findPaymentByStripeChargeId(chargeId)` - Find by Stripe charge ID
- `updatePayment(paymentId, updates)` - Update payment status
- `getPaymentsForUser(userId)` - Get user's payments
- `getPaymentsForEvent(eventId)` - Get event's payments

### Helper Functions

- `calculateTotalGuests(partySize, dinnerPartySize)` - **Legacy helper**; with the new model, unique event headcount is `partySize`, and dinner headcount is `dinner.partySize`. New code should rely directly on these fields. Implementation now just returns `partySize`. **Note:** `addRsvp()` currently calls `calculateTotalGuests()` but since it returns `partySize`, the real source of truth is `partySize` and `dinner.partySize`. New code should not rely on `calculateTotalGuests` for anything non-trivial.
- `getDinnerPartySize(r: Rsvp)` - Returns `r.dinner?.enabled ? r.dinner.partySize : 0`
- `getCocktailOnlyMax(r: Rsvp)` - Returns `Math.max(r.partySize - getDinnerPartySize(r), 0)`

---

## 🔄 Complete Flow Examples

### Example 1: User RSVPs to Event

```
1. EventPage.jsx loads → GET /events/:slug
   → findEventBySlug() + getEventCounts() + getCocktailsOnlyCount()
   → Display event with capacity

2. EventCard.jsx loads dinner slots → GET /events/:slug/dinner-slots
   → findEventBySlug() + generateDinnerTimeSlots() + getDinnerSlotCounts()
   → Display available slots

3. User submits RSVP → POST /events/:slug/rsvp
   → findEventBySlug() → findOrCreatePerson() → addRsvp()
   → addRsvp() currently calls calculateTotalGuests() (legacy, returns partySize) + checks capacity
   → Sets bookingStatus: "CONFIRMED" or "WAITLIST" based on capacity (event-level)
   → Initializes dinnerPullUpCount: 0, cocktailOnlyPullUpCount: 0 (arrival counters)
   → **Dinner block mapping:**
     - If wantsDinner === true and dinnerTimeSlot/dinnerPartySize provided:
       - Creates dinner object: { enabled: true, partySize, slotTime, bookingStatus }
     - Else: dinner = null
   → Returns statusDetails with bookingStatus (event-level) and dinner.bookingStatus (dinner-level)
   → Show toast → Refetch event → GET /events/:slug
   → Update capacity display
```

### Example 2: Host Updates Guest Check-In Status (Admin Check-In Flow)

**Location:** `/app/events/:id/guests` (Protected - Manage Event → Guests Tab)

**Complete Step-by-Step Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Admin Opens Guests List                                │
└─────────────────────────────────────────────────────────────────┘
EventGuestsPage.jsx loads
  → GET /host/events/:id/guests
  → Backend: findEventById() + getRsvpsForEvent()
  → Returns: { guests: [...] } (each guest has bookingStatus, dinnerPullUpCount, cocktailOnlyPullUpCount, dinner.bookingStatus)
  → Frontend: setGuests(data.guests)
  → Display table with current check-in status:
     - "Not checked in" if dinnerPullUpCount === 0 && cocktailOnlyPullUpCount === 0
     - "PARTIAL" badge if (dinnerPullUpCount + cocktailOnlyPullUpCount) > 0 && < partySize
     - "FULL" badge if (dinnerPullUpCount + cocktailOnlyPullUpCount) === partySize
     - "🍽️ 4" badge if dinnerPullUpCount > 0
     - "🥂 3" badge if cocktailOnlyPullUpCount > 0

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Admin Clicks Guest Row to Check In                     │
└─────────────────────────────────────────────────────────────────┘
User clicks on guest row (tr element)
  → handleRowClick(guest) → setPulledUpModalGuest(guest)
  → PulledUpModal opens with:
     - Guest name and email displayed
     - Dinner pull-up input (current: guest.dinnerPullUpCount ?? 0) - only if dinner enabled
     - Cocktails-only pull-up input (current: guest.cocktailOnlyPullUpCount ?? 0)
     - Max values shown:
       * Dinner max = getDinnerPartySize(guest) (cannot exceed dinner party size)
       * Cocktails-only max = getCocktailOnlyMax(guest) (cannot exceed cocktails-only portion)

┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Admin Enters Check-In Counts & Saves                   │
└─────────────────────────────────────────────────────────────────┘
Admin enters: Dinner = 4, Cocktails-only = 3
  → Clicks "Save" button
  → handleSubmit() → setLoading(true)
  → Calls onSave(4, 3)  // dinnerPullUpCount, cocktailOnlyPullUpCount

┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Frontend Sends PUT Request                             │
└─────────────────────────────────────────────────────────────────┘
PUT /host/events/:eventId/rsvps/:rsvpId
  Headers: { "Content-Type": "application/json" }
  Body: {
    dinnerPullUpCount: 4,
    cocktailOnlyPullUpCount: 3
  }

┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Backend Validates & Updates Data                       │
└─────────────────────────────────────────────────────────────────┘
Backend (index.js):
  → Extracts dinnerPullUpCount=4, cocktailOnlyPullUpCount=3 from req.body
  → Calls updateRsvp(rsvpId, { dinnerPullUpCount: 4, cocktailOnlyPullUpCount: 3 })

Backend (data.js - updateRsvp):
  → Finds RSVP in rsvps array
  → Validates:
     - If `bookingStatus !== "CONFIRMED"`, prevent non-zero pull-up counts ✓
     - dinnerPullUpCount max = getDinnerPartySize(r) (4 <= dinner.partySize) ✓
     - cocktailOnlyPullUpCount max = getCocktailOnlyMax(r) (3 <= partySize - dinner.partySize) ✓
  → Updates in-memory data:
     rsvps[idx] = {
       ...rsvp,
       dinnerPullUpCount: 4,
       cocktailOnlyPullUpCount: 3
     }
  → Returns: { rsvp: updatedRsvp }

Backend (index.js):
  → res.status(200).json(result.rsvp) ✅ 200 OK Response

┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Frontend Receives 200 & Refetches Data                 │
└─────────────────────────────────────────────────────────────────┘
Frontend (EventGuestsPage.jsx - onSave callback):
  → if (!res.ok) → throw error (not reached, got 200 ✓)
  → Refetch guests: GET /host/events/:id/guests
  → Backend returns updated guest list with new check-in values
  → setGuests(data.guests) → Updates table state
  → setPulledUpModalGuest(null) → Closes modal
  → showToast("Check-in status updated successfully! ✨", "success")
  → return true

Frontend (PulledUpModal):
  → Receives success=true from onSave
  → setSaved(true) → Shows "✓ Saved!" message
  → setTimeout(() => onClose(), 1000) → Modal closes after 1 second

┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: Table Updates with New Check-In Status                 │
└─────────────────────────────────────────────────────────────────┘
EventGuestsPage.jsx re-renders with updated guests array
  → Table displays:
     - Pull-up status: "PARTIAL" (7/10) or "FULL" (7/7) based on partySize
     - "🍽️ 4" badge if dinnerPullUpCount > 0
     - "🥂 3" badge if cocktailOnlyPullUpCount > 0
  → Admin can now see the guest is checked in ✅
  → Admin can physically welcome the guests to the event

┌─────────────────────────────────────────────────────────────────┐
│ STEP 8: Overview Tab Updates Per-Slot Totals                  │
└─────────────────────────────────────────────────────────────────┘
If admin switches to Overview tab (ManageEventPage.jsx):
  → Filters guests by dinner.slotTime === slot.time
  → Sums dinnerPullUpCount values for that slot
  → Displays: "✓ 4 / 10 pulled up" for the slot
  → Shows aggregated check-in stats across all guests
```

**Key Points:**

- ✅ Data is persisted in backend (in-memory, will be in database)
- ✅ 200 OK response confirms successful update
- ✅ Frontend refetches to get latest data from backend
- ✅ Table updates immediately showing new check-in status
- ✅ Admin sees confirmation toast and updated UI
- ✅ Admin can verify check-in before welcoming guests
- ✅ Pull-up status is derived: "NONE" (0), "PARTIAL" (0 < count < max), "FULL" (count === max)

### Example 3: Host Creates Event

```
1. CreateEventPage.jsx → User fills form → Submits

2. POST /events
   → createEvent() → Creates event in memory
   → [If paid] createStripeProduct() + createStripePrice()
   → [If paid] updateEvent() with Stripe IDs
   → Returns created event

3. Navigate to → /app/events/:id/manage
   → ManageEventPage.jsx loads → GET /host/events/:id
   → Display event for editing
```

---

## 📝 Notes

- All data is currently stored in-memory (arrays in `data.js`)
- No authentication middleware yet (all routes are accessible)
- Stripe integration is partially implemented (backend ready, frontend not connected)
- Payment routes exist but are not used in frontend yet
- CRM person update route exists but is not used in frontend yet
