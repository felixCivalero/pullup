# Authentication & Personal Admin Audit

**Date:** December 2024  
**Goal:** Implement full authentication with Supabase (Google OAuth) and make admin pages personal (user can only see their own events)

---

## 🔍 Current State Analysis

### ✅ What's Already Done

1. **Supabase Setup:**

   - ✅ Database schema created
   - ✅ Google OAuth connected to Supabase
   - ✅ Environment variables configured
   - ✅ Supabase client libraries installed (`@supabase/supabase-js` v2.87.1)

2. **Database Schema:**

   - ✅ `events` table has `host_id` column (UUID, nullable)
   - ✅ Foreign key ready: `host_id` can reference `auth.users(id)`

3. **Backend:**
   - ✅ Supabase client initialized
   - ✅ All data functions migrated to Supabase

### ❌ What's Missing

1. **Authentication:**

   - ❌ No Supabase Auth client in frontend
   - ❌ No authentication context/provider
   - ❌ No login/logout UI
   - ❌ No session management
   - ❌ No protected route checks

2. **User Isolation:**

   - ❌ Events not linked to users (`host_id` is null)
   - ❌ `/events` endpoint returns ALL events (no filtering)
   - ❌ `/host/events/:id` doesn't verify ownership
   - ❌ Event creation doesn't set `host_id`

3. **Security:**

   - ❌ **RLS (Row Level Security) disabled** on all tables
   - ❌ No backend auth middleware
   - ❌ No user verification in API routes

4. **Frontend:**
   - ❌ No auth state management
   - ❌ No login page/component
   - ❌ Protected routes not actually protected
   - ❌ No user profile/session display

---

## 📋 Required Implementation Tasks

### Phase 1: Supabase Database Setup

#### 1.1 Update Events Table

- [ ] **Add foreign key constraint** for `host_id` → `auth.users(id)`
- [ ] **Set `host_id` to NOT NULL** (after migration of existing data)
- [ ] **Add index** on `host_id` for performance

#### 1.2 Enable Row Level Security (RLS)

- [ ] **Enable RLS** on `events` table
- [ ] **Enable RLS** on `rsvps` table
- [ ] **Enable RLS** on `people` table (if needed)
- [ ] **Enable RLS** on `payments` table

#### 1.3 Create RLS Policies

**Events Table:**

- [ ] **Policy:** Users can SELECT their own events
- [ ] **Policy:** Users can INSERT events with their own `host_id`
- [ ] **Policy:** Users can UPDATE their own events
- [ ] **Policy:** Users can DELETE their own events
- [ ] **Policy:** Public can SELECT events by slug (for public event pages)

**RSVPs Table:**

- [ ] **Policy:** Users can SELECT RSVPs for their events
- [ ] **Policy:** Public can INSERT RSVPs (for public RSVP form)
- [ ] **Policy:** Users can UPDATE RSVPs for their events
- [ ] **Policy:** Users can DELETE RSVPs for their events

**People Table:**

- [ ] **Policy:** Users can SELECT all people (for CRM)
- [ ] **Policy:** Users can UPDATE people (for CRM)
- [ ] **Policy:** Public can INSERT people (when creating RSVP)

**Payments Table:**

- [ ] **Policy:** Users can SELECT payments for their events
- [ ] **Policy:** Users can INSERT payments
- [ ] **Policy:** Users can UPDATE payments for their events

---

### Phase 2: Frontend Authentication

#### 2.1 Install & Setup Supabase Client

- [ ] **Create** `frontend/src/lib/supabase.js` - Supabase client with anon key
- [ ] **Configure** client with auth settings (persist session, auto refresh)

#### 2.2 Create Auth Context

- [ ] **Create** `frontend/src/contexts/AuthContext.jsx`
- [ ] **Implement:**
  - `useAuth()` hook
  - `user` state (from Supabase session)
  - `loading` state
  - `signInWithGoogle()` function
  - `signOut()` function
  - Session persistence (localStorage/cookies)

#### 2.3 Create Login Component

- [ ] **Create** `frontend/src/components/LoginPage.jsx` or update `LandingPage.jsx`
- [ ] **Add** "Sign in with Google" button
- [ ] **Handle** OAuth redirect flow
- [ ] **Show** loading states

#### 2.4 Update Protected Routes

- [ ] **Update** `ProtectedLayout.jsx` to check auth
- [ ] **Redirect** to login if not authenticated
- [ ] **Show** user info in header (name, avatar)
- [ ] **Add** logout button

---

### Phase 3: Backend Authentication

#### 3.1 Add Auth Middleware

- [ ] **Create** `backend/src/middleware/auth.js`
- [ ] **Extract** JWT token from `Authorization` header
- [ ] **Verify** token with Supabase
- [ ] **Add** `req.user` with user ID and email
- [ ] **Handle** errors (401 Unauthorized)

#### 3.2 Protect API Routes

- [ ] **Add** auth middleware to `/host/*` routes
- [ ] **Add** auth middleware to `/events` POST (create event)
- [ ] **Keep** public routes open: `/events/:slug` (GET), `/events/:slug/rsvp` (POST)

#### 3.3 Update Event Creation

- [ ] **Set** `host_id` from `req.user.id` when creating events
- [ ] **Update** `createEvent()` to accept `hostId` parameter
- [ ] **Update** `mapEventToDb()` to include `host_id`

#### 3.4 Update Event Queries

- [ ] **Filter** `/events` to only return events where `host_id = req.user.id`
- [ ] **Verify** ownership in `/host/events/:id` (GET, PUT, DELETE)
- [ ] **Filter** `/host/events/:id/guests` by event ownership
- [ ] **Filter** `/host/crm/people` by events owned by user

---

### Phase 4: Data Migration

#### 4.1 Migrate Existing Events

- [ ] **Identify** existing events with `host_id = null`
- [ ] **Option 1:** Assign to first authenticated user
- [ ] **Option 2:** Delete orphaned events
- [ ] **Option 3:** Create migration script to assign based on email/name

#### 4.2 Update Existing Data Functions

- [ ] **Update** `getAllPeopleWithStats()` to filter by user's events
- [ ] **Update** `getPaymentsForUser()` to filter by user's events
- [ ] **Update** all aggregation functions to respect user ownership

---

### Phase 5: Frontend Updates

#### 5.1 Update Event List

- [ ] **Filter** events in `HomePage.jsx` (already filtered by backend, but verify)
- [ ] **Show** "No events" message if empty
- [ ] **Add** user name/avatar in header

#### 5.2 Update Event Creation

- [ ] **Verify** user is authenticated before showing create form
- [ ] **Pass** auth token in API requests

#### 5.3 Update API Calls

- [ ] **Add** `Authorization: Bearer <token>` header to all `/host/*` requests
- [ ] **Handle** 401 errors (redirect to login)
- [ ] **Handle** token refresh

---

## 🔒 Security Considerations

### Critical Issues to Fix

1. **RLS Disabled (HIGH PRIORITY):**

   - Currently, anyone with database access can see all data
   - **Fix:** Enable RLS and create proper policies

2. **No Backend Auth Verification:**

   - API routes don't verify user identity
   - **Fix:** Add auth middleware to all protected routes

3. **Events Not Linked to Users:**

   - `host_id` is null, so events aren't owned
   - **Fix:** Set `host_id` on event creation

4. **Public Routes Exposed:**
   - `/events` returns all events (should be filtered)
   - **Fix:** Filter by `host_id` for authenticated users

---

## 📊 Database Changes Required

### 1. Update Events Table

```sql
-- Add foreign key constraint
ALTER TABLE events
ADD CONSTRAINT events_host_id_fkey
FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_events_host_id ON events(host_id);

-- Make host_id NOT NULL (after data migration)
-- ALTER TABLE events ALTER COLUMN host_id SET NOT NULL;
```

### 2. Enable RLS

```sql
-- Enable RLS on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
```

### 3. Create RLS Policies

**Events Policies:**

```sql
-- Users can view their own events
CREATE POLICY "Users can view their own events"
  ON events FOR SELECT
  USING (auth.uid() = host_id);

-- Users can create events with their own host_id
CREATE POLICY "Users can create their own events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = host_id);

-- Users can update their own events
CREATE POLICY "Users can update their own events"
  ON events FOR UPDATE
  USING (auth.uid() = host_id);

-- Users can delete their own events
CREATE POLICY "Users can delete their own events"
  ON events FOR DELETE
  USING (auth.uid() = host_id);

-- Public can view events by slug (for public pages)
CREATE POLICY "Public can view events by slug"
  ON events FOR SELECT
  USING (true); -- Will be filtered by backend for public access
```

**RSVPs Policies:**

```sql
-- Users can view RSVPs for their events
CREATE POLICY "Users can view RSVPs for their events"
  ON rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = rsvps.event_id
      AND events.host_id = auth.uid()
    )
  );

-- Public can create RSVPs
CREATE POLICY "Public can create RSVPs"
  ON rsvps FOR INSERT
  WITH CHECK (true); -- Backend validates event exists

-- Users can update RSVPs for their events
CREATE POLICY "Users can update RSVPs for their events"
  ON rsvps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = rsvps.event_id
      AND events.host_id = auth.uid()
    )
  );

-- Users can delete RSVPs for their events
CREATE POLICY "Users can delete RSVPs for their events"
  ON rsvps FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = rsvps.event_id
      AND events.host_id = auth.uid()
    )
  );
```

**People Policies:**

```sql
-- Users can view all people (for CRM)
CREATE POLICY "Users can view people"
  ON people FOR SELECT
  USING (true); -- Backend filters by user's events

-- Public can create people (when RSVPing)
CREATE POLICY "Public can create people"
  ON people FOR INSERT
  WITH CHECK (true);

-- Users can update people (for CRM)
CREATE POLICY "Users can update people"
  ON people FOR UPDATE
  USING (true); -- Backend validates access
```

**Payments Policies:**

```sql
-- Users can view payments for their events
CREATE POLICY "Users can view payments for their events"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = payments.event_id
      AND events.host_id = auth.uid()
    )
  );

-- Users can create payments
CREATE POLICY "Users can create payments"
  ON payments FOR INSERT
  WITH CHECK (true); -- Backend validates

-- Users can update payments for their events
CREATE POLICY "Users can update payments for their events"
  ON payments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = payments.event_id
      AND events.host_id = auth.uid()
    )
  );
```

---

## 🎯 Implementation Order

### Step 1: Database Setup (Using MCP)

1. Add foreign key constraint to `events.host_id`
2. Add index on `host_id`
3. Enable RLS on all tables
4. Create RLS policies

### Step 2: Frontend Auth Setup

1. Create Supabase client
2. Create AuthContext
3. Create login component
4. Update ProtectedLayout

### Step 3: Backend Auth

1. Create auth middleware
2. Protect API routes
3. Update event creation to set `host_id`
4. Filter events by `host_id`

### Step 4: Data Migration

1. Migrate existing events (assign to user or delete)
2. Test all functionality

### Step 5: Testing & Polish

1. Test login/logout flow
2. Test event creation (verify `host_id` set)
3. Test event list (verify only user's events)
4. Test public event pages (should still work)
5. Test RSVP flow (should still work)

---

## 🔍 Current Issues Identified

### Database

- ❌ `host_id` is nullable and not set
- ❌ No foreign key constraint
- ❌ RLS disabled (security risk)
- ❌ No RLS policies

### Backend

- ❌ No auth middleware
- ❌ No user verification in routes
- ❌ Events created without `host_id`
- ❌ `/events` returns all events (not filtered)

### Frontend

- ❌ No Supabase Auth client
- ❌ No authentication state
- ❌ No login UI
- ❌ Protected routes not actually protected
- ❌ No user session management

---

## 📝 Files to Create/Modify

### New Files

- `frontend/src/lib/supabase.js` - Supabase client
- `frontend/src/contexts/AuthContext.jsx` - Auth context/provider
- `frontend/src/components/LoginPage.jsx` - Login component (or update LandingPage)
- `backend/src/middleware/auth.js` - Auth middleware

### Files to Modify

- `backend/src/data.js` - Add `hostId` to `createEvent()`, filter queries
- `backend/src/index.js` - Add auth middleware, filter `/events`, protect routes
- `frontend/src/App.jsx` - Wrap with AuthProvider
- `frontend/src/components/ProtectedLayout.jsx` - Add auth check
- `frontend/src/pages/HomePage.jsx` - Add auth token to requests
- `frontend/src/pages/CreateEventPage.jsx` - Add auth token to requests
- `frontend/src/pages/ManageEventPage.jsx` - Add auth token to requests

---

## ✅ Success Criteria

After implementation:

- ✅ Users can sign in with Google
- ✅ Users can only see their own events
- ✅ Users can only manage their own events
- ✅ Public event pages still work (no auth required)
- ✅ Public RSVP flow still works (no auth required)
- ✅ RLS policies enforce data isolation
- ✅ Backend verifies user identity on all protected routes
- ✅ Session persists across page refreshes
- ✅ Logout works correctly

---

## 🚨 Risks & Mitigation

### Risk 1: Existing Events Without `host_id`

**Mitigation:** Migration script to assign events to first authenticated user, or delete orphaned events

### Risk 2: RLS Too Restrictive

**Mitigation:** Test public routes thoroughly, ensure public policies allow necessary access

### Risk 3: Token Expiration

**Mitigation:** Implement token refresh in frontend, handle 401 errors gracefully

### Risk 4: Breaking Public Routes

**Mitigation:** Keep public routes (`/events/:slug`, `/events/:slug/rsvp`) accessible without auth

---

## 📊 Estimated Complexity

- **Database Setup:** Low-Medium (MCP makes it easy)
- **Frontend Auth:** Medium (standard Supabase Auth pattern)
- **Backend Auth:** Medium (middleware + route protection)
- **Data Migration:** Low (simple SQL updates)
- **Testing:** Medium (need to test all flows)

**Total Estimated Time:** 2-4 hours

---

## 🎯 Next Steps

1. **Review this audit** - Confirm approach
2. **Start with database setup** - Use MCP to add constraints, enable RLS, create policies
3. **Implement frontend auth** - Create client, context, login UI
4. **Implement backend auth** - Add middleware, protect routes
5. **Test thoroughly** - Verify all flows work

---

**Status:** Ready for implementation! 🚀
