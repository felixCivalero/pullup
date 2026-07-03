// Host profiles repo — profile CRUD, default-profile seeding (incl. sales_leads
// auto-link), Stripe connected-account id, and profile <-> DB field mapping.
import { supabase } from "../supabase.js";

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

  const profile = mapProfileFromDb(data);

  // If profile has a picture path, generate the appropriate URL
  // We store the file path (e.g., "userId/profile.ext") in the database
  // and generate signed URLs (for private buckets) or public URLs (for public buckets) on fetch
  if (profile.profilePicture) {
    try {
      let filePath = profile.profilePicture;

      // If it's already a full URL, extract the path
      if (profile.profilePicture.includes("profile-pictures/")) {
        const urlMatch = profile.profilePicture.match(
          /profile-pictures\/([^?]+)/
        );
        if (urlMatch) {
          filePath = urlMatch[1];
        }
      }

      // Try to generate signed URL first (for private buckets)
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("profile-pictures")
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (!urlError && signedUrlData?.signedUrl) {
        profile.profilePicture = signedUrlData.signedUrl;
      } else {
        // Fallback to public URL (for public buckets or if signed URL fails)
        const {
          data: { publicUrl },
        } = supabase.storage.from("profile-pictures").getPublicUrl(filePath);
        profile.profilePicture = publicUrl;
      }
    } catch (urlError) {
      // If URL generation fails, try to use stored value as-is
      console.error("Error generating profile picture URL:", urlError);
    }
  }

  // Generate URL for brand logo if path exists
  if (profile.brandLogo) {
    try {
      let filePath = profile.brandLogo;
      if (profile.brandLogo.includes("profile-pictures/")) {
        const urlMatch = profile.brandLogo.match(/profile-pictures\/([^?]+)/);
        if (urlMatch) filePath = urlMatch[1];
      }
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("profile-pictures")
        .createSignedUrl(filePath, 3600);
      if (!urlError && signedUrlData?.signedUrl) {
        profile.brandLogo = signedUrlData.signedUrl;
      } else {
        const { data: { publicUrl } } = supabase.storage.from("profile-pictures").getPublicUrl(filePath);
        profile.brandLogo = publicUrl;
      }
    } catch (urlError) {
      console.error("Error generating brand logo URL:", urlError);
    }
  }

  return profile;
}

// Create default profile.
//
// Runs the first time getUserProfile() is called for a freshly authenticated
// user. We use this moment for two pieces of housekeeping:
//
//   1. Seed contact_email from the auth user's email so it's not null on
//      first load.
//   2. Auto-link any sales_leads rows that were tracking this email before
//      the user signed up. This preserves sales pipeline state (status,
//      notes, source attribution) across the prospect → user transition,
//      and prevents the admin sales view from showing both the original
//      lead row AND a duplicate auto-surfaced "user" row for the same person.
export async function createDefaultProfile(userId) {
  // Pull the auth user's email + metadata — service-role only, OK in this
  // backend. The metadata is the identity seed: Google OAuth puts full_name/
  // avatar there, and our own RSVP account-creation writes full_name too.
  let authEmail = null;
  let authMeta = {};
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    authEmail = authUser?.user?.email?.toLowerCase().trim() || null;
    authMeta = authUser?.user?.user_metadata || {};
  } catch (err) {
    console.warn("[createDefaultProfile] auth lookup failed:", err.message);
  }

  // Signup origin (migration 079): if a people row was already linked to this
  // auth user when the profile is first created, the account was born as a
  // guest on the RSVP path; otherwise they came through the front door. This
  // runs exactly once per account, at the only moment the answer is knowable
  // by construction — no inference flag needed.
  // The same person row doubles as an identity source: they told us their
  // name / Instagram when they RSVP'd, so a brand-new host account starts
  // pre-filled instead of as "SOMEONE" — Settings lets them overrule.
  let signupOrigin = "landing";
  let person = null;
  try {
    const { data: personRow } = await supabase
      .from("people")
      .select("id, name, instagram")
      .eq("auth_user_id", userId)
      .limit(1)
      .maybeSingle();
    if (personRow) { signupOrigin = "rsvp"; person = personRow; }
    else if (authEmail) {
      // Not auth-linked (yet) but we may still know them from an RSVP under
      // the same email — good enough to seed a display name from.
      const { data: byEmail } = await supabase
        .from("people")
        .select("id, name, instagram")
        .ilike("email", authEmail)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (byEmail) person = byEmail;
    }
  } catch (err) {
    console.warn("[createDefaultProfile] origin lookup failed:", err.message);
  }

  const trimmed = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const seededName = trimmed(authMeta.full_name) || trimmed(authMeta.name) || trimmed(person?.name);

  const defaultProfile = {
    id: userId,
    name: seededName,
    brand: null,
    bio: null,
    profile_picture_url: null,
    mobile_number: null,
    branding_links: {
      instagram: trimmed(person?.instagram) || "",
      x: "",
      youtube: "",
      tiktok: "",
      linkedin: "",
      website: "",
    },
    brand_website: null,
    brand_logo_url: null,
    contact_email: authEmail,
    additional_emails: [],
    third_party_accounts: [],
    is_admin: false,
    signup_origin: signupOrigin,
    signup_origin_inferred: false,
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(defaultProfile)
    .select()
    .single();

  if (error) throw error;

  // Auto-link unlinked sales_leads with this email. Lead emails are stored
  // lowercase (POST /admin/sales/leads normalizes), so an exact match works.
  // Matching with .is("profile_id", null) keeps idempotency — admin manual
  // links won't be overwritten by re-signup of a different user.
  if (authEmail) {
    try {
      await supabase
        .from("sales_leads")
        .update({
          profile_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("email", authEmail)
        .is("profile_id", null);
    } catch (err) {
      // Non-fatal: GET /admin/sales/leads still runs an email-based
      // auto-match as a fallback when the admin views the page.
      console.warn("[createDefaultProfile] sales link failed:", err.message);
    }
  }

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

// Update Stripe connected account ID for a user
export async function updateUserStripeConnectedAccountId(userId, accountId) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ stripe_connected_account_id: accountId })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return mapProfileFromDb(data);
}

// Get Stripe connected account ID for a user
export async function getUserStripeConnectedAccountId(userId) {
  const profile = await getUserProfile(userId);
  return profile.stripeConnectedAccountId || null;
}

function mapProfileFromDb(dbProfile) {
  return {
    id: dbProfile.id,
    name: dbProfile.name || "",
    brand: dbProfile.brand || "",
    bio: dbProfile.bio || "",
    city: dbProfile.city || "",
    visitorId: dbProfile.visitor_id || null,
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
    brandWebsite: dbProfile.brand_website || "",
    brandLogo: dbProfile.brand_logo_url || null,
    contactEmail: dbProfile.contact_email || "",
    stripeConnectedAccountId: dbProfile.stripe_connected_account_id || null,
    isAdmin: dbProfile.is_admin || false,
    signupOrigin: dbProfile.signup_origin || null,
    signupOriginInferred: dbProfile.signup_origin_inferred || false,
    uiPrefs: dbProfile.ui_prefs || {},
    hostBrief: dbProfile.host_brief || "",
    // Phone-as-identity + WhatsApp host preferences (migrations 037 + 044).
    // Surfaced under both camelCase and snake_case so the settings UI
    // (which keys off snake_case to match DB column names) and any
    // existing camelCase callers both keep working.
    phoneE164:             dbProfile.phone_e164 || null,
    phoneCountry:          dbProfile.phone_country || null,
    phoneVerifiedAt:       dbProfile.phone_verified_at || null,
    whatsappSignature:     dbProfile.whatsapp_signature || "",
    whatsappEnabled:       dbProfile.whatsapp_enabled === false ? false : true,
    phone_e164:            dbProfile.phone_e164 || null,
    phone_country:         dbProfile.phone_country || null,
    phone_verified_at:     dbProfile.phone_verified_at || null,
    whatsapp_signature:    dbProfile.whatsapp_signature || "",
    whatsapp_enabled:      dbProfile.whatsapp_enabled === false ? false : true,
    // Host-customizable visual brand DESIGN fields (mig 045: primary/background/
    // text/font/logo) were removed — no longer read or written. The profile's
    // `brand` (display name), `brand_website`, and `branding_links` remain.
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
  if (profile.city !== undefined) dbProfile.city = profile.city;
  // Stamp visitor_id only on first capture so a returning user from a
  // different device doesn't overwrite the earlier (more meaningful)
  // pre-signup visitor cookie. The frontend only sends it during
  // onboarding finalize, so this defensive guard is belt-and-braces.
  if (profile.visitorId !== undefined && profile.visitorId !== null) {
    dbProfile.visitor_id = profile.visitorId;
  }
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
  if (profile.brandWebsite !== undefined)
    dbProfile.brand_website = profile.brandWebsite;
  // brandLogo is the host's uploaded logo (managed by the profile-media upload
  // route), distinct from the removed visual brand DESIGN bundle. Kept.
  if (profile.brandLogo !== undefined)
    dbProfile.brand_logo_url = profile.brandLogo;
  if (profile.contactEmail !== undefined)
    dbProfile.contact_email = profile.contactEmail;
  if (profile.stripeConnectedAccountId !== undefined)
    dbProfile.stripe_connected_account_id = profile.stripeConnectedAccountId;
  // is_admin is intentionally NOT updatable here. Privilege escalation would
  // otherwise be possible by POSTing { "isAdmin": true } to /host/profile.
  // The admin flag is granted out-of-band via scripts/grant_admin.js, which
  // writes the column directly.
  if (profile.hostBrief !== undefined) dbProfile.host_brief = profile.hostBrief;
  // Per-host UI prefs (mig 117) — a small jsonb bag (banner dismissals etc.).
  // The client sends the whole object; last write wins.
  if (profile.uiPrefs !== undefined && typeof profile.uiPrefs === "object" && profile.uiPrefs !== null)
    dbProfile.ui_prefs = profile.uiPrefs;
  // WhatsApp host prefs (migration 044). Accept either camelCase or
  // snake_case so the settings UI can save with the DB column names
  // directly without an extra mapping layer on the frontend.
  if (profile.whatsappSignature !== undefined)
    dbProfile.whatsapp_signature = profile.whatsappSignature;
  else if (profile.whatsapp_signature !== undefined)
    dbProfile.whatsapp_signature = profile.whatsapp_signature;
  if (profile.whatsappEnabled !== undefined)
    dbProfile.whatsapp_enabled = !!profile.whatsappEnabled;
  else if (profile.whatsapp_enabled !== undefined)
    dbProfile.whatsapp_enabled = !!profile.whatsapp_enabled;

  // Host-customizable visual brand DESIGN tokens (mig 045: primary/background/
  // text/font/logo) were removed — no longer written. `brand` (display name),
  // `brand_website`, and `branding_links` above are kept.
  return dbProfile;
}
