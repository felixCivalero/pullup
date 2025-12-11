# Supabase Migration Plan

**Status:** In Progress  
**Date:** December 2024

---

## Overview

This document outlines the complete migration from in-memory data storage to Supabase PostgreSQL database.

---

## Phase 1: Database Schema ✅

### Completed

- ✅ `people` table created
- ✅ `events` table created
- ✅ `rsvps` table created
- ✅ `payments` table created
- ✅ Indexes created
- ✅ Foreign key constraints set up
- ✅ Updated_at triggers configured

### Pending

- ⏳ Row Level Security (RLS) policies (will be added after auth setup)

---

## Phase 2: Supabase Client Setup

### Backend Client Initialization

**File:** `backend/src/supabase.js` (new file)

```javascript
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables");
}

// Service role client (bypasses RLS, for backend use only)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
```

---

## Phase 3: Data Layer Migration

### Migration Strategy

We'll migrate incrementally, function by function, maintaining backward compatibility during transition.

### 3.1 People CRUD Operations

**Functions to migrate:**

- `findOrCreatePerson()` → Supabase `people` table
- `findPersonById()` → Supabase query
- `findPersonByEmail()` → Supabase query
- `updatePerson()` → Supabase update
- `updatePersonStripeCustomerId()` → Supabase update
- `getAllPeopleWithStats()` → Supabase query with joins

**Mapping:**

```javascript
// In-memory → Supabase
person.id → id (UUID)
person.email → email (TEXT, UNIQUE)
person.name → name (TEXT)
person.phone → phone (TEXT)
person.notes → notes (TEXT)
person.tags → tags (TEXT[])
person.stripeCustomerId → stripe_customer_id (TEXT)
person.createdAt → created_at (TIMESTAMPTZ)
person.updatedAt → updated_at (TIMESTAMPTZ)
```

### 3.2 Events CRUD Operations

**Functions to migrate:**

- `createEvent()` → Supabase insert
- `findEventBySlug()` → Supabase query
- `findEventById()` → Supabase query
- `updateEvent()` → Supabase update

**Mapping:**

```javascript
// In-memory → Supabase
event.id → id (UUID)
event.slug → slug (TEXT, UNIQUE)
event.title → title (TEXT)
event.description → description (TEXT)
event.location → location (TEXT)
event.startsAt → starts_at (TIMESTAMPTZ)
event.endsAt → ends_at (TIMESTAMPTZ)
event.timezone → timezone (TEXT)
event.cocktailCapacity → cocktail_capacity (INTEGER)
event.foodCapacity → food_capacity (INTEGER)
event.totalCapacity → total_capacity (INTEGER)
event.maxPlusOnesPerGuest → max_plus_ones_per_guest (INTEGER)
event.waitlistEnabled → waitlist_enabled (BOOLEAN)
event.dinnerEnabled → dinner_enabled (BOOLEAN)
event.dinnerStartTime → dinner_start_time (TIMESTAMPTZ)
event.dinnerEndTime → dinner_end_time (TIMESTAMPTZ)
event.dinnerSeatingIntervalHours → dinner_seating_interval_hours (NUMERIC)
event.dinnerMaxSeatsPerSlot → dinner_max_seats_per_slot (INTEGER)
event.dinnerOverflowAction → dinner_overflow_action (TEXT)
event.ticketPrice → ticket_price (INTEGER)
event.stripeProductId → stripe_product_id (TEXT)
event.stripePriceId → stripe_price_id (TEXT)
event.imageUrl → image_url (TEXT)
event.theme → theme (TEXT)
event.visibility → visibility (TEXT)
event.calendarCategory → calendar_category (TEXT)
event.ticketType → ticket_type (TEXT)
event.requireApproval → require_approval (BOOLEAN)
event.isPaid → is_paid (BOOLEAN)
event.createdAt → created_at (TIMESTAMPTZ)
event.updatedAt → updated_at (TIMESTAMPTZ)
```

### 3.3 RSVPs CRUD Operations

**Functions to migrate:**

- `addRsvp()` → Supabase insert with capacity checks
- `getRsvpsForEvent()` → Supabase query with person join
- `findRsvpById()` → Supabase query with person join
- `updateRsvp()` → Supabase update with capacity checks
- `deleteRsvp()` → Supabase delete

**Mapping:**

```javascript
// In-memory → Supabase
rsvp.id → id (UUID)
rsvp.personId → person_id (UUID, FK)
rsvp.eventId → event_id (UUID, FK)
rsvp.slug → slug (TEXT)
rsvp.bookingStatus → booking_status (TEXT)
rsvp.status → status (TEXT)
rsvp.plusOnes → plus_ones (INTEGER)
rsvp.partySize → party_size (INTEGER)
rsvp.dinner → dinner (JSONB)
rsvp.wantsDinner → wants_dinner (BOOLEAN)
rsvp.dinnerStatus → dinner_status (TEXT)
rsvp.dinnerTimeSlot → dinner_time_slot (TEXT)
rsvp.dinnerPartySize → dinner_party_size (INTEGER)
rsvp.capacityOverridden → capacity_overridden (BOOLEAN)
rsvp.dinnerPullUpCount → dinner_pull_up_count (INTEGER)
rsvp.cocktailOnlyPullUpCount → cocktail_only_pull_up_count (INTEGER)
rsvp.pulledUp → pulled_up (BOOLEAN)
rsvp.pulledUpCount → pulled_up_count (INTEGER)
rsvp.pulledUpForDinner → pulled_up_for_dinner (INTEGER)
rsvp.pulledUpForCocktails → pulled_up_for_cocktails (INTEGER)
rsvp.paymentId → payment_id (UUID)
rsvp.paymentStatus → payment_status (TEXT)
rsvp.totalGuests → total_guests (INTEGER)
rsvp.createdAt → created_at (TIMESTAMPTZ)
rsvp.updatedAt → updated_at (TIMESTAMPTZ)
```

### 3.4 Helper Functions (Aggregations)

**Functions to migrate:**

- `getEventCounts()` → Supabase aggregation query
- `getCocktailsOnlyCount()` → Supabase aggregation with DPCS logic
- `getDinnerSlotCounts()` → Supabase aggregation grouped by slot
- `getDinnerCounts()` → Supabase aggregation (legacy)

**Key Challenge:**
These functions need to replicate the Dynamic Party Composition System (DPCS) logic in SQL or via JavaScript after fetching data.

**Strategy:**

- For complex calculations (DPCS), fetch RSVPs and calculate in JavaScript (maintains logic consistency)
- For simple aggregations, use SQL GROUP BY and SUM

### 3.5 Payments CRUD Operations

**Functions to migrate:**

- `createPayment()` → Supabase insert
- `findPaymentById()` → Supabase query
- `findPaymentByStripePaymentIntentId()` → Supabase query
- `findPaymentByStripeChargeId()` → Supabase query
- `updatePayment()` → Supabase update
- `getPaymentsForUser()` → Supabase query
- `getPaymentsForEvent()` → Supabase query

**Mapping:**

```javascript
// In-memory → Supabase
payment.id → id (UUID)
payment.userId → user_id (UUID)
payment.eventId → event_id (UUID, FK)
payment.rsvpId → rsvp_id (UUID, FK)
payment.stripePaymentIntentId → stripe_payment_intent_id (TEXT, UNIQUE)
payment.stripeCustomerId → stripe_customer_id (TEXT)
payment.stripeChargeId → stripe_charge_id (TEXT)
payment.stripeCheckoutSessionId → stripe_checkout_session_id (TEXT)
payment.amount → amount (INTEGER, cents)
payment.currency → currency (TEXT)
payment.status → status (TEXT)
payment.paymentMethod → payment_method (TEXT)
payment.description → description (TEXT)
payment.receiptUrl → receipt_url (TEXT)
payment.refundedAmount → refunded_amount (INTEGER)
payment.refundedAt → refunded_at (TIMESTAMPTZ)
payment.metadata → metadata (JSONB)
payment.createdAt → created_at (TIMESTAMPTZ)
payment.updatedAt → updated_at (TIMESTAMPTZ)
payment.paidAt → paid_at (TIMESTAMPTZ)
```

---

## Phase 4: Implementation Order

### Step 1: Supabase Client Setup ✅

- [x] Create `backend/src/supabase.js`
- [ ] Test connection

### Step 2: People Migration

- [ ] Migrate `findOrCreatePerson()`
- [ ] Migrate `findPersonById()`
- [ ] Migrate `findPersonByEmail()`
- [ ] Migrate `updatePerson()`
- [ ] Migrate `updatePersonStripeCustomerId()`
- [ ] Migrate `getAllPeopleWithStats()`
- [ ] Test all people operations

### Step 3: Events Migration

- [ ] Migrate `createEvent()` (with slug uniqueness check)
- [ ] Migrate `findEventBySlug()`
- [ ] Migrate `findEventById()`
- [ ] Migrate `updateEvent()`
- [ ] Test all event operations

### Step 4: RSVPs Migration (Most Complex)

- [ ] Migrate `getEventCounts()` (test aggregation)
- [ ] Migrate `getCocktailsOnlyCount()` (test DPCS logic)
- [ ] Migrate `getDinnerSlotCounts()` (test slot aggregation)
- [ ] Migrate `addRsvp()` (with capacity checks)
- [ ] Migrate `getRsvpsForEvent()` (with person join)
- [ ] Migrate `findRsvpById()` (with person join)
- [ ] Migrate `updateRsvp()` (with capacity checks)
- [ ] Migrate `deleteRsvp()`
- [ ] Test all RSVP operations

### Step 5: Payments Migration

- [ ] Migrate `createPayment()`
- [ ] Migrate `findPaymentById()`
- [ ] Migrate `findPaymentByStripePaymentIntentId()`
- [ ] Migrate `findPaymentByStripeChargeId()`
- [ ] Migrate `updatePayment()`
- [ ] Migrate `getPaymentsForUser()`
- [ ] Migrate `getPaymentsForEvent()`
- [ ] Test all payment operations

### Step 6: Cleanup

- [ ] Remove in-memory arrays (`people`, `events`, `rsvps`, `payments`)
- [ ] Remove old helper functions if replaced
- [ ] Update all imports
- [ ] Final testing

---

## Phase 5: Testing Strategy

### Unit Testing

- Test each migrated function independently
- Verify data integrity (foreign keys, constraints)
- Test edge cases (duplicate emails, capacity limits, etc.)

### Integration Testing

- Test full RSVP flow (create person → create RSVP → update → delete)
- Test capacity calculations
- Test waitlist logic
- Test admin override
- Test payment linking

### API Testing

- Test all API endpoints
- Verify response formats match frontend expectations
- Test error handling

---

## Phase 6: Rollback Plan

If issues arise:

1. Keep in-memory arrays as fallback
2. Add feature flag to switch between in-memory and Supabase
3. Monitor error logs
4. Have migration rollback SQL ready

---

## Notes

### Slug Uniqueness

- In-memory: `ensureUniqueSlug()` function
- Supabase: Database UNIQUE constraint on `slug` column
- Strategy: Try insert, catch duplicate error, append counter

### ID Generation

- In-memory: `evt_${Date.now()}`, `person_${Date.now()}`, etc.
- Supabase: UUID via `gen_random_uuid()`
- Strategy: Use UUIDs throughout, update frontend if needed

### Timestamps

- In-memory: `new Date().toISOString()`
- Supabase: `TIMESTAMPTZ` with `NOW()` default
- Strategy: Let database handle timestamps, or use JavaScript ISO strings

### JSONB Fields

- `rsvp.dinner` → `dinner` (JSONB)
- `payment.metadata` → `metadata` (JSONB)
- Strategy: Store as JSONB, parse/stringify in JavaScript

---

## Current Status

- ✅ Database schema created
- ⏳ Supabase client setup (in progress)
- ⏳ Data layer migration (pending)

---

**Next Step:** Create Supabase client and start migrating People CRUD operations.
