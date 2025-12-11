# Supabase Migration Status

**Last Updated:** December 2024

---

## ✅ Completed

### Phase 1: Database Schema
- ✅ `people` table created
- ✅ `events` table created  
- ✅ `rsvps` table created
- ✅ `payments` table created
- ✅ All indexes and foreign keys configured
- ✅ Updated_at triggers set up

### Phase 2: Supabase Client
- ✅ `backend/src/supabase.js` created
- ✅ Environment variables configured
- ✅ Connection tested

### Phase 3: Data Layer Migration

#### People CRUD ✅
- ✅ `findOrCreatePerson()` → Supabase
- ✅ `findPersonById()` → Supabase
- ✅ `findPersonByEmail()` → Supabase
- ✅ `updatePerson()` → Supabase
- ✅ `updatePersonStripeCustomerId()` → Supabase
- ✅ `getAllPeopleWithStats()` → Supabase (with RSVP joins)

#### Events CRUD ✅
- ✅ `createEvent()` → Supabase (with unique slug check)
- ✅ `findEventBySlug()` → Supabase
- ✅ `findEventById()` → Supabase
- ✅ `updateEvent()` → Supabase

---

## ⏳ In Progress

### RSVPs Migration (Most Complex)
- ⏳ `getEventCounts()` → Supabase
- ⏳ `getCocktailsOnlyCount()` → Supabase (DPCS logic)
- ⏳ `getDinnerSlotCounts()` → Supabase
- ⏳ `addRsvp()` → Supabase (with capacity checks)
- ⏳ `getRsvpsForEvent()` → Supabase (with person join)
- ⏳ `findRsvpById()` → Supabase (with person join)
- ⏳ `updateRsvp()` → Supabase (with capacity checks, admin override)
- ⏳ `deleteRsvp()` → Supabase

### Payments Migration
- ⏳ `createPayment()` → Supabase
- ⏳ `findPaymentById()` → Supabase
- ⏳ `findPaymentByStripePaymentIntentId()` → Supabase
- ⏳ `findPaymentByStripeChargeId()` → Supabase
- ⏳ `updatePayment()` → Supabase
- ⏳ `getPaymentsForUser()` → Supabase
- ⏳ `getPaymentsForEvent()` → Supabase

---

## 📋 Pending

### API Routes Update
- ⏳ Update all API routes to handle async functions
- ⏳ Add error handling for database errors
- ⏳ Test all endpoints

### Testing
- ⏳ Unit tests for migrated functions
- ⏳ Integration tests for full flows
- ⏳ Edge case testing

### Cleanup
- ⏳ Remove in-memory arrays
- ⏳ Remove deprecated code
- ⏳ Update documentation

### RLS Policies
- ⏳ Set up Row Level Security (after auth implementation)

---

## 🔧 Technical Notes

### Function Signatures Changed
All migrated functions are now `async` and return Promises. API routes need to be updated to use `await` or `.then()`.

### Data Mapping
- Database uses snake_case (e.g., `created_at`, `person_id`)
- Application uses camelCase (e.g., `createdAt`, `personId`)
- Helper functions `mapPersonFromDb()`, `mapEventFromDb()`, etc. handle conversion

### Slug Uniqueness
- Now handled by database UNIQUE constraint
- `ensureUniqueSlug()` queries database to find available slug

### ID Generation
- Changed from `evt_${Date.now()}` to UUID (`gen_random_uuid()`)
- Frontend may need updates if it relies on ID format

---

## 🚨 Breaking Changes

1. **All data functions are now async** - API routes must use `await`
2. **ID format changed** - From `evt_123` to UUID format
3. **Error handling** - Database errors need proper handling

---

## 📝 Next Steps

1. Complete RSVPs migration (most critical)
2. Complete Payments migration
3. Update all API routes to handle async
4. Test thoroughly
5. Remove in-memory arrays
6. Deploy and monitor

---

**Status:** ~40% Complete - Core People and Events migrated, RSVPs in progress
