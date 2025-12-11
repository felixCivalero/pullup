# User Profile Implementation Audit

**Date:** December 2024  
**Status:** 🔍 **AUDIT COMPLETE - READY FOR IMPLEMENTATION**

---

## 📋 Current State Analysis

### Where Profile Data is Currently Stored

**❌ Problem:** User profile data is stored in **localStorage** on the frontend:

- **Location:** `localStorage.getItem("pullup_user")`
- **File:** `frontend/src/pages/HomePage.jsx` (lines 40-136)
- **Data Structure:**
  ```javascript
  {
    name: "Felix civalero",
    brand: "Skuggan x Jägermeister",
    email: "felix.civalero@gmail.com",
    bio: "Jag heter Felix och jag hostar den här skiten bre!",
    profilePicture: null, // Base64 string
    joinedDate: "August 2024",
    brandingLinks: {
      instagram: "",
      x: "",
      youtube: "",
      tiktok: "",
      linkedin: "",
      website: ""
    },
    emails: [{ email: "...", primary: true }],
    mobileNumber: "",
    thirdPartyAccounts: [...]
  }
  ```

### Issues with Current Approach

1. **❌ Not Persistent:** Data is lost if localStorage is cleared
2. **❌ Not Synced:** Different devices show different data
3. **❌ Not Linked to Auth:** Profile data not tied to Supabase user
4. **❌ No Backend:** No API endpoints to save/load profiles
5. **❌ No Database:** No `profiles` table in Supabase

---

## 🎯 What Needs to Be Implemented

### 1. Database Schema

Create a `profiles` table in Supabase that extends `auth.users`:

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic Profile Info
  name TEXT,
  brand TEXT,
  bio TEXT,
  profile_picture_url TEXT, -- Store URL, not base64

  -- Contact Info
  mobile_number TEXT,

  -- Branding Links (stored as JSONB for flexibility)
  branding_links JSONB DEFAULT '{}'::jsonb,
  -- Structure: { instagram: "", x: "", youtube: "", tiktok: "", linkedin: "", website: "" }

  -- Additional Emails (stored as JSONB array)
  additional_emails JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{ email: "...", primary: true }]

  -- Third-Party Accounts (stored as JSONB array)
  third_party_accounts JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{ id: "google", name: "Google", email: "...", linked: false }]

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_profiles_brand ON public.profiles(brand);
CREATE INDEX idx_profiles_name ON public.profiles(name);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (on first login)
CREATE POLICY "Users can create their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 2. Backend API Endpoints

Create profile management endpoints in `backend/src/index.js`:

#### GET `/host/profile` - Get user profile

- Requires auth
- Returns profile data for authenticated user
- Creates profile if doesn't exist (with defaults)

#### PUT `/host/profile` - Update user profile

- Requires auth
- Updates profile data
- Validates ownership (RLS handles this, but backend should verify)

#### POST `/host/profile/picture` - Upload profile picture

- Requires auth
- Uploads to Supabase Storage
- Returns URL to store in `profile_picture_url`

### 3. Backend Data Layer

Add profile functions to `backend/src/data.js`:

```javascript
// Get user profile
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error && error.code === "PGRST116") {
    // Profile doesn't exist, create default
    return await createDefaultProfile(userId);
  }

  if (error) throw error;
  return mapProfileFromDb(data);
}

// Create default profile
export async function createDefaultProfile(userId) {
  // Get user email from auth.users
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.admin.getUserById(userId);
  if (authError) throw authError;

  const defaultProfile = {
    id: userId,
    name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
    brand: "",
    bio: "",
    profile_picture_url: user.user_metadata?.avatar_url || null,
    mobile_number: "",
    branding_links: {
      instagram: "",
      x: "",
      youtube: "",
      tiktok: "",
      linkedin: "",
      website: "",
    },
    additional_emails: [],
    third_party_accounts: [],
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(defaultProfile)
    .select()
    .single();

  if (error) throw error;
  return mapProfileFromDb(data);
}

// Update user profile
export async function updateUserProfile(userId, updates) {
  const dbUpdates = mapProfileToDb(updates);

  const { data, error } = await supabase
    .from("profiles")
    .update(dbUpdates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return mapProfileFromDb(data);
}

// Helper: Map database profile to application format
function mapProfileFromDb(dbProfile) {
  return {
    id: dbProfile.id,
    name: dbProfile.name || "",
    brand: dbProfile.brand || "",
    bio: dbProfile.bio || "",
    profilePicture: dbProfile.profile_picture_url || null,
    mobileNumber: dbProfile.mobile_number || "",
    brandingLinks: dbProfile.branding_links || {
      instagram: "",
      x: "",
      youtube: "",
      tiktok: "",
      linkedin: "",
      website: "",
    },
    emails: dbProfile.additional_emails || [],
    thirdPartyAccounts: dbProfile.third_party_accounts || [],
    createdAt: dbProfile.created_at,
    updatedAt: dbProfile.updated_at,
  };
}

// Helper: Map application profile to database format
function mapProfileToDb(profile) {
  const dbProfile = {};
  if (profile.name !== undefined) dbProfile.name = profile.name;
  if (profile.brand !== undefined) dbProfile.brand = profile.brand;
  if (profile.bio !== undefined) dbProfile.bio = profile.bio;
  if (profile.profilePicture !== undefined)
    dbProfile.profile_picture_url = profile.profilePicture;
  if (profile.mobileNumber !== undefined)
    dbProfile.mobile_number = profile.mobileNumber;
  if (profile.brandingLinks !== undefined)
    dbProfile.branding_links = profile.brandingLinks;
  if (profile.emails !== undefined)
    dbProfile.additional_emails = profile.emails;
  if (profile.thirdPartyAccounts !== undefined)
    dbProfile.third_party_accounts = profile.thirdPartyAccounts;
  return dbProfile;
}
```

### 4. Frontend Updates

#### Replace localStorage with Supabase

**File:** `frontend/src/pages/HomePage.jsx`

**Current:**

```javascript
const [user, setUser] = useState(loadUserFromStorage);
useEffect(() => {
  localStorage.setItem("pullup_user", JSON.stringify(user));
}, [user]);
```

**New:**

```javascript
const { user: authUser } = useAuth();
const [user, setUser] = useState(null);
const [profileLoading, setProfileLoading] = useState(true);

useEffect(() => {
  async function loadProfile() {
    if (!authUser) {
      setProfileLoading(false);
      return;
    }

    try {
      const res = await authenticatedFetch("/host/profile");
      if (res.ok) {
        const profile = await res.json();
        setUser(profile);
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setProfileLoading(false);
    }
  }

  loadProfile();
}, [authUser]);

// Save profile to Supabase when user updates
const handleSaveProfile = async (updates) => {
  try {
    const res = await authenticatedFetch("/host/profile", {
      method: "PUT",
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setUser(updated);
      showToast("Profile saved successfully! ✨", "success");
    }
  } catch (error) {
    console.error("Failed to save profile:", error);
    showToast("Failed to save profile", "error");
  }
};
```

#### Update SettingsTab Component

**File:** `frontend/src/components/HomeSettingsTab.jsx`

- Remove localStorage save logic
- Call `handleSaveProfile` when user clicks "Save"
- Show loading state while saving

#### Profile Picture Upload

**File:** `frontend/src/components/HomeProfileHeader.jsx`

- Upload to Supabase Storage instead of storing base64
- Get signed URL for display
- Update profile with URL after upload

### 5. Supabase Storage Setup

Create storage bucket for profile pictures:

```sql
-- Create storage bucket (via Supabase dashboard or API)
-- Bucket name: 'profile-pictures'
-- Public: false (private)
-- File size limit: 5MB
-- Allowed MIME types: image/jpeg, image/png, image/webp

-- RLS Policy for storage
CREATE POLICY "Users can upload their own profile picture"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-pictures' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own profile picture"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'profile-pictures' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own profile picture"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-pictures' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

---

## 📝 Implementation Plan

### Phase 1: Database Setup ✅

1. Create `profiles` table
2. Add RLS policies
3. Create indexes
4. Add triggers

### Phase 2: Backend Implementation ✅

1. Add profile functions to `data.js`
2. Create API endpoints in `index.js`
3. Add profile picture upload endpoint
4. Test endpoints

### Phase 3: Frontend Migration ✅

1. Update `HomePage.jsx` to fetch from API
2. Update `SettingsTab.jsx` to save via API
3. Update `ProfileHeader.jsx` for image upload
4. Remove localStorage logic
5. Handle loading states

### Phase 4: Data Migration ✅

1. Create migration script to move localStorage data
2. Run migration for existing users
3. Clean up localStorage

### Phase 5: Testing ✅

1. Test profile creation on first login
2. Test profile updates
3. Test profile picture upload
4. Test across devices (sync)
5. Test RLS policies

---

## 🔒 Security Considerations

### Row Level Security (RLS)

- ✅ Users can only view/edit their own profile
- ✅ Profile creation tied to authenticated user ID
- ✅ Storage policies restrict access to own files

### Backend Validation

- ✅ Verify user ID matches authenticated user
- ✅ Validate profile data (sanitize inputs)
- ✅ Validate image uploads (size, type)

### Data Privacy

- ✅ Profile data only accessible to owner
- ✅ Profile pictures stored privately
- ✅ No public profile endpoints (unless needed later)

---

## 📊 Data Migration Strategy

### For Existing Users (localStorage → Supabase)

1. **On First Login:**

   - Check if profile exists in Supabase
   - If not, check localStorage
   - If localStorage has data, migrate it
   - Create profile in Supabase
   - Clear localStorage

2. **Migration Script:**
   ```javascript
   // Run once for existing users
   async function migrateLocalStorageToSupabase() {
     const stored = localStorage.getItem("pullup_user");
     if (!stored) return;

     const parsed = JSON.parse(stored);
     const profile = {
       name: parsed.name,
       brand: parsed.brand,
       bio: parsed.bio,
       profile_picture_url: parsed.profilePicture, // If base64, upload first
       mobile_number: parsed.mobileNumber,
       branding_links: parsed.brandingLinks,
       additional_emails: parsed.emails,
       third_party_accounts: parsed.thirdPartyAccounts,
     };

     // Save to Supabase via API
     await authenticatedFetch("/host/profile", {
       method: "PUT",
       body: JSON.stringify(profile),
     });

     // Clear localStorage
     localStorage.removeItem("pullup_user");
   }
   ```

---

## 🎯 Success Criteria

After implementation:

- ✅ User profile data stored in Supabase
- ✅ Profile synced across devices
- ✅ Profile persists after logout/login
- ✅ Profile picture uploads work
- ✅ Settings page saves to database
- ✅ RLS prevents unauthorized access
- ✅ Migration from localStorage complete

---

## 📋 Files to Create/Modify

### New Files

- `backend/src/storage.js` - Supabase Storage helpers (optional)

### Files to Modify

- `backend/src/data.js` - Add profile functions
- `backend/src/index.js` - Add profile endpoints
- `frontend/src/pages/HomePage.jsx` - Replace localStorage with API
- `frontend/src/components/HomeSettingsTab.jsx` - Save via API
- `frontend/src/components/HomeProfileHeader.jsx` - Upload to Storage

---

## 🚀 Next Steps

1. **Review this audit** - Confirm approach
2. **Create database schema** - Use MCP to create `profiles` table
3. **Implement backend** - Add profile functions and endpoints
4. **Update frontend** - Replace localStorage with API calls
5. **Test thoroughly** - Verify all flows work
6. **Migrate data** - Move existing localStorage data

---

**Status:** ✅ **READY FOR IMPLEMENTATION!**

All requirements identified. Ready to build user profiles with Supabase! 🚀
