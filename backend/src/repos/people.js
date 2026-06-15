// People repo: person rows, identity lookups (email/auth account), viewer
// resolution, and CRM filters/stats over the host's people.
import crypto from "node:crypto";
import { supabase } from "../supabase.js";
import { getUserEventIds } from "./eventAccess.js";

export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Identity-style RSVP form field types that promote to columns on `people`
// (see migration 019). Anything not in this set stays in rsvps.custom_answers.
// `type` here matches FORM_FIELD_PRESETS in frontend/.../CreateEventPage.jsx.
const IDENTITY_FIELD_TO_PERSON_COLUMN = {
  instagram: "instagram",
  twitter: "twitter",
  tiktok: "tiktok",
  linkedin: "linkedin",
  company: "company",
  birthday: "birthday",
  phone: "phone",
};

/**
 * Split a customAnswers object (keyed by form-field id) into:
 *   - personUpdates: { instagram, twitter, ... } for identity-typed fields
 *   - remainingAnswers: only truly-custom (non-identity) entries
 *
 * Empty / whitespace-only values are dropped — we never overwrite a stored
 * value with blank on resubmit.
 */
export function splitCustomAnswers(customAnswers, formFields) {
  const personUpdates = {};
  const remainingAnswers = {};
  if (!customAnswers || typeof customAnswers !== "object") {
    return { personUpdates, remainingAnswers };
  }
  const fieldsById = new Map();
  (Array.isArray(formFields) ? formFields : []).forEach((f) => {
    if (f && typeof f === "object" && f.id) fieldsById.set(f.id, f);
  });
  for (const [fieldId, rawValue] of Object.entries(customAnswers)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    const field = fieldsById.get(fieldId);
    const type = field ? String(field.type || "").toLowerCase() : null;
    const personColumn = type ? IDENTITY_FIELD_TO_PERSON_COLUMN[type] : null;
    if (personColumn) {
      // Only promote non-empty values; an empty answer means "don't change
      // what we already have on the person" (last-write-wins, blanks ignored).
      if (value !== null && value !== undefined && value !== "") {
        personUpdates[personColumn] = value;
      }
    } else {
      remainingAnswers[fieldId] = rawValue;
    }
  }
  return { personUpdates, remainingAnswers };
}

// ---------------------------
// People/Contacts CRUD
// ---------------------------

// Find or create a person by email
export async function findOrCreatePerson(email, name = null) {
  const normalizedEmail = email.trim().toLowerCase();

  // Try to find existing person. maybeSingle (not single) so not-found is a clean
  // null, never a thrown error, and a stray duplicate can't blow up the read.
  const { data: existingPerson } = await supabase
    .from("people")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingPerson) {
    // Person exists - update name if provided and different
    if (name && name.trim() && existingPerson.name !== name.trim()) {
      const { data: updatedPerson, error: updateError } = await supabase
        .from("people")
        .update({ name: name.trim() })
        .eq("id", existingPerson.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating person name:", updateError);
        // Return existing person even if update fails
        return mapPersonFromDb(existingPerson);
      }
      return mapPersonFromDb(updatedPerson);
    }
    return mapPersonFromDb(existingPerson);
  }

  // Person doesn't exist - create new
  const { data: newPerson, error: insertError } = await supabase
    .from("people")
    .insert({
      email: normalizedEmail,
      name: name ? name.trim() : null,
      phone: null,
      tags: [],
      stripe_customer_id: null,
    })
    .select()
    .single();

  if (insertError) {
    // A concurrent RSVP for the same email won the race — the lower(email) unique
    // index (mig: people_email_unique) rejects this insert. Re-read instead of
    // throwing or forking a duplicate person.
    if (insertError.code === "23505") {
      const { data: raced } = await supabase
        .from("people").select("*").eq("email", normalizedEmail).maybeSingle();
      if (raced) return mapPersonFromDb(raced);
    }
    console.error("Error creating person:", insertError);
    throw new Error("Failed to create person");
  }

  return mapPersonFromDb(newPerson);
}

// Map a Postgres check_violation (SQLSTATE 23514) into a friendly message the
// MCP coach (and humans) can act on. Returns null for any other error.
function friendlyConstraintError(error) {
  if (error?.code !== "23514") return null;
  const match = String(error.message || "").match(/constraint "([^"]+)"/);
  if (!match) return null;
  const KNOWN = {
    events_visibility_check: "visibility must be 'public' or 'private'",
    events_calendar_category_check: "calendar must be 'personal' or 'business'",
    events_ticket_type_check: "ticketType must be 'free' or 'paid'",
    check_status: "status must be 'DRAFT' or 'PUBLISHED'",
    check_created_via: "createdVia must be 'post', 'create', or 'legacy'",
  };
  return KNOWN[match[1]] || `constraint ${match[1]} violated`;
}

export function throwConstraintError(error) {
  const friendly = friendlyConstraintError(error);
  if (!friendly) return false;
  const err = new Error(friendly);
  err.statusCode = 400;
  err.code = "constraint_violation";
  throw err;
}

// Find person by ID
export async function findPersonById(personId) {
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("id", personId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPersonFromDb(data);
}

// A person "belongs" to a host iff they have at least one RSVP to one of the
// host's events. This is the same scope getPeopleWithFilters / getAllPeopleWithStats
// use, so the detail GET/PUT endpoints stay consistent with the list view.
export async function personBelongsToHost(personId, userId) {
  if (!personId || !userId) return false;

  // In the host's world via an RSVP to one of their events…
  const eventIds = await getUserEventIds(userId);
  if (eventIds && eventIds.length > 0) {
    const { data, error } = await supabase
      .from("rsvps")
      .select("id")
      .eq("person_id", personId)
      .in("event_id", eventIds)
      .limit(1);
    if (error) console.error("[personBelongsToHost] rsvp error:", error);
    else if (Array.isArray(data) && data.length > 0) return true;
  }

  // …or via a direct messaging thread with this host. Someone who DM'd the
  // host's connected Instagram / WhatsApp account is just as much "in their
  // world" as an RSVP'er — and an IG/WA-only lead often has no RSVP at all.
  // Without this, the Room can't message them back (silent not_in_world).
  for (const table of ["instagram_threads", "whatsapp_threads"]) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("person_id", personId)
      .eq("host_profile_id", userId)
      .limit(1);
    if (error) { console.error(`[personBelongsToHost] ${table} error:`, error); continue; }
    if (Array.isArray(data) && data.length > 0) return true;
  }

  return false;
}

// ─── Content Planner cards (per-host) ─────────────────────────────────
// Durable storage for the planner canvas. Scoped by host_id; all writes go
// through the service-role client and re-assert host_id.


export async function findPersonByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPersonFromDb(data);
}

// Resolve a person by the DURABLE account link (people.auth_user_id == auth user).
// This is the spine: a logged-in human maps to their person even if their auth
// email later differs from the address they first RSVP'd with.
export async function findPersonByAuthUserId(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("auth_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!error && data) return mapPersonFromDb(data);
  // Account linking (mig 067): the column is the PRIMARY login; this auth user
  // may instead be a linked SECONDARY login of some canonical person. Pure
  // fallback — only reached when the column misses, so primary logins resolve
  // exactly as before and nothing existing changes.
  const linkedId = await personIdByAuthAccount(userId);
  if (linkedId) {
    const { data: p } = await supabase.from("people").select("*").eq("id", linkedId).maybeSingle();
    if (p) return mapPersonFromDb(p);
  }
  return null;
}

// Resolve a person_id from a (possibly secondary) login via person_auth_accounts.
// Returns null when the auth account isn't linked to anyone.
export async function personIdByAuthAccount(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from("person_auth_accounts")
    .select("person_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return data?.person_id || null;
}

// Keep person_auth_accounts the complete source of truth: when a login is first
// linked to a person via the column, mirror it here as the primary. Best-effort.
async function recordPrimaryAuthAccount(personId, userId, email) {
  try {
    await supabase.from("person_auth_accounts").upsert(
      { person_id: personId, auth_user_id: userId, method: "primary", email: email || null, is_primary: true },
      { onConflict: "auth_user_id", ignoreDuplicates: true },
    );
  } catch { /* non-fatal — column remains the primary resolver */ }
}

// THE identity resolver the room/access layer should use: durable account link
// first (auth_user_id), then the email used. So a logged-in viewer always maps
// to their canonical person; anon/email-only callers still resolve by email.
export async function resolvePerson({ userId = null, email = null }) {
  if (userId) {
    const byAuth = await findPersonByAuthUserId(userId);
    if (byAuth) return byAuth;
  }
  if (email) return findPersonByEmail(email);
  return null;
}

// Is this auth user an admin? Cheap check — only called when a view-as override
// header is actually present, so it never touches the normal request path.
export async function isAdminUser(userId) {
  if (!userId) return false;
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  return !!data?.is_admin;
}

// Admin "View as": resolve the EFFECTIVE viewer for a request. An admin may
// impersonate ANY person by sending `x-pullup-view-as: <personId>`. This is
// verified SERVER-SIDE against profiles.is_admin on the REAL session — a
// non-admin's header is silently ignored, so it can never be forged into access.
// Returns the person plus their account link (authUserId) so callers can do both
// person-scoped (RSVP/pull-up) and host(account)-scoped checks as them.
export async function resolveViewer(req, { email = null } = {}) {
  const realUserId = req.user?.id || null;
  const viewAsId = (req.headers?.["x-pullup-view-as"] || "").toString().trim() || null;
  if (viewAsId && realUserId && (await isAdminUser(realUserId))) {
    const { data } = await supabase.from("people").select("*").eq("id", viewAsId).maybeSingle();
    if (data) {
      return { person: mapPersonFromDb(data), authUserId: data.auth_user_id || null, impersonating: true, realUserId };
    }
  }
  // SECURITY: identity comes from the VERIFIED session only (or an admin
  // view-as header, admin-gated). A caller-supplied email is corroborating at
  // most — consulted ONLY when there's a real session, and even then userId
  // wins. An unauthenticated caller can NEVER assume an identity by passing an
  // email: no session ⇒ no viewer. (There is no email-claim path anywhere; even
  // the live door-code pull-up resolves the person from the scanner's session.)
  const effectiveEmail = realUserId ? email : null;
  const person = await resolvePerson({ userId: realUserId, email: effectiveEmail });
  return { person, authUserId: realUserId, impersonating: false, realUserId };
}

// Admin "Force status": an admin may force an access level via the
// `x-pullup-force-level` header (preview a state without a user in it). Admin-gated.
export async function adminForceLevel(req) {
  const realUserId = req.user?.id || null;
  const lvl = (req.headers?.["x-pullup-force-level"] || "").toString().trim() || null;
  if (lvl && realUserId && (await isAdminUser(realUserId))) return lvl;
  return null;
}

// Self-heal the account<->person link on login. Idempotent: link an existing
// person by email if unclaimed, else create one. Keeps the spine wired going
// forward (the one-time backfill handled existing rows).
export async function ensurePersonLinked({ userId, email, name = null }) {
  if (!userId || !email) return null;
  const e = String(email).trim().toLowerCase();
  const { data: byAuth } = await supabase
    .from("people").select("id").eq("auth_user_id", userId).limit(1).maybeSingle();
  if (byAuth) return byAuth.id;
  // Account linking: a linked SECONDARY login resolves to its canonical person —
  // never spawn a duplicate for an auth account an admin already linked.
  const linkedId = await personIdByAuthAccount(userId);
  if (linkedId) return linkedId;
  const { data: byEmail } = await supabase
    .from("people").select("id, auth_user_id").eq("email", e).limit(1).maybeSingle();
  if (byEmail) {
    if (!byEmail.auth_user_id) {
      await supabase.from("people").update({ auth_user_id: userId }).eq("id", byEmail.id);
      await recordPrimaryAuthAccount(byEmail.id, userId, e);
    }
    return byEmail.id;
  }
  const { data: created } = await supabase
    .from("people")
    .insert({ email: e, name, auth_user_id: userId, import_source: "account_signup" })
    .select("id").maybeSingle();
  if (created?.id) await recordPrimaryAuthAccount(created.id, userId, e);
  return created?.id || null;
}

// Helper: Map database person to application format
function mapPersonFromDb(dbPerson) {
  return {
    id: dbPerson.id,
    email: dbPerson.email,
    name: dbPerson.name,
    phone: dbPerson.phone,
    tags: dbPerson.tags || [],
    stripeCustomerId: dbPerson.stripe_customer_id,
    // Identity fields collected via event form_fields (see migration 019).
    // Belong on the person, not the RSVP — surfaced here so the CRM can
    // read/filter/export without unpacking rsvps.custom_answers.
    instagram: dbPerson.instagram || null,
    ig_user_id: dbPerson.ig_user_id || null, // IGSID — the DM recipient id (vs `instagram` = display handle)
    twitter: dbPerson.twitter || null,
    tiktok: dbPerson.tiktok || null,
    linkedin: dbPerson.linkedin || null,
    company: dbPerson.company || null,
    birthday: dbPerson.birthday || null,
    // CRM fields
    totalSpend: dbPerson.total_spend || 0,
    paymentCount: dbPerson.payment_count || 0,
    refundedVolume: dbPerson.refunded_volume || 0,
    disputeLosses: dbPerson.dispute_losses || 0,
    subscriptionType: dbPerson.subscription_type || null,
    interestedIn: dbPerson.interested_in || null,
    importSource: dbPerson.import_source || null,
    importMetadata: dbPerson.import_metadata || null,
    campaignsReceived: dbPerson.campaigns_received || [],
    // Marketing-unsubscribe timestamp surfaces here so callers can decide
    // sendability without re-querying.
    marketingUnsubscribedAt: dbPerson.marketing_unsubscribed_at || null,
    // Phone-as-identity (migration 037). Surfaced under both camelCase
    // and snake_case so the CRM UI can use whichever convention.
    phoneE164:           dbPerson.phone_e164 || null,
    phoneCountry:        dbPerson.phone_country || null,
    phoneVerifiedAt:     dbPerson.phone_verified_at || null,
    whatsappCapableAt:   dbPerson.whatsapp_capable_at || null,
    phone_e164:          dbPerson.phone_e164 || null,
    phone_country:       dbPerson.phone_country || null,
    phone_verified_at:   dbPerson.phone_verified_at || null,
    whatsapp_capable_at: dbPerson.whatsapp_capable_at || null,
    createdAt: dbPerson.created_at,
    updatedAt: dbPerson.updated_at,
  };
}

// Helper: Map application person updates to database format
export function mapPersonToDb(updates) {
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.stripeCustomerId !== undefined)
    dbUpdates.stripe_customer_id = updates.stripeCustomerId;
  // Identity fields (see mapPersonFromDb and migration 019).
  if (updates.instagram !== undefined) dbUpdates.instagram = updates.instagram;
  if (updates.twitter !== undefined) dbUpdates.twitter = updates.twitter;
  if (updates.tiktok !== undefined) dbUpdates.tiktok = updates.tiktok;
  if (updates.linkedin !== undefined) dbUpdates.linkedin = updates.linkedin;
  if (updates.company !== undefined) dbUpdates.company = updates.company;
  if (updates.birthday !== undefined) dbUpdates.birthday = updates.birthday;
  // CRM fields
  if (updates.totalSpend !== undefined)
    dbUpdates.total_spend = Number(updates.totalSpend) || 0;
  if (updates.paymentCount !== undefined)
    dbUpdates.payment_count = Number(updates.paymentCount) || 0;
  if (updates.refundedVolume !== undefined)
    dbUpdates.refunded_volume = Number(updates.refundedVolume) || 0;
  if (updates.disputeLosses !== undefined)
    dbUpdates.dispute_losses = Number(updates.disputeLosses) || 0;
  if (updates.subscriptionType !== undefined)
    dbUpdates.subscription_type = updates.subscriptionType;
  if (updates.interestedIn !== undefined)
    dbUpdates.interested_in = updates.interestedIn;
  if (updates.importSource !== undefined)
    dbUpdates.import_source = updates.importSource;
  if (updates.importMetadata !== undefined)
    dbUpdates.import_metadata = updates.importMetadata;
  return dbUpdates;
}

// Update person
export async function updatePerson(personId, updates) {
  const dbUpdates = mapPersonToDb(updates);

  const { data, error } = await supabase
    .from("people")
    .update(dbUpdates)
    .eq("id", personId)
    .select()
    .single();

  if (error || !data) {
    return { error: "not_found" };
  }

  return { person: mapPersonFromDb(data) };
}

// Update person's Stripe customer ID
export async function updatePersonStripeCustomerId(personId, stripeCustomerId) {
  const { data, error } = await supabase
    .from("people")
    .update({ stripe_customer_id: stripeCustomerId })
    .eq("id", personId)
    .select()
    .single();

  if (error || !data) {
    return { error: "not_found" };
  }

  return { person: mapPersonFromDb(data) };
}

// Get all people with their event statistics (filtered by user's events)
export async function getAllPeopleWithStats(userId) {
  if (!userId) {
    return [];
  }

  // First, get all event IDs for this user (owner or co-host)
  const eventIds = await getUserEventIds(userId);

  if (!eventIds || eventIds.length === 0) {
    return [];
  }

  // RSVPs for this user's events FIRST (bounded by eventIds). This decides WHICH
  // people we need — we then fetch only those. The old code fetched the entire
  // GLOBAL people table with a bare select (capped at 1000) and filtered in JS,
  // so at scale it silently dropped people.
  const { data: allRsvps, error: rsvpsError } = await supabase
    .from("rsvps")
    .select(
      `
      *,
      events:event_id (
        id,
        title,
        slug,
        starts_at
      )
    `
    )
    .in("event_id", eventIds);

  if (rsvpsError) {
    console.error("Error fetching RSVPs:", rsvpsError);
    return [];
  }

  // Group RSVPs by person.
  const rsvpsByPerson = {};
  for (const rsvp of allRsvps || []) {
    if (!rsvp.person_id) continue;
    (rsvpsByPerson[rsvp.person_id] ||= []).push(rsvp);
  }
  const personIdsWithRsvps = Object.keys(rsvpsByPerson);
  if (personIdsWithRsvps.length === 0) return [];

  // Fetch ONLY those people, batched (a single oversized .in() 400s, and the
  // table is far bigger than the 1000-row default).
  const PEOPLE_BATCH = 150;
  const relevantPeople = [];
  for (let i = 0; i < personIdsWithRsvps.length; i += PEOPLE_BATCH) {
    const { data, error } = await supabase
      .from("people")
      .select("*")
      .in("id", personIdsWithRsvps.slice(i, i + PEOPLE_BATCH));
    if (error) { console.error("Error fetching people batch:", error.message); continue; }
    if (data) relevantPeople.push(...data);
  }

  // Calculate stats for each person
  const peopleWithStats = relevantPeople.map((dbPerson) => {
    const personRsvps = rsvpsByPerson[dbPerson.id] || [];

    const eventsAttended = personRsvps.filter(
      (r) => r.booking_status === "CONFIRMED" || r.status === "attending"
    ).length;
    const eventsWaitlisted = personRsvps.filter(
      (r) => r.booking_status === "WAITLIST" || r.status === "waitlist"
    ).length;
    const totalEvents = personRsvps.length;
    const totalGuestsBrought = personRsvps.reduce(
      (sum, r) => sum + (r.plus_ones || 0),
      0
    );
    const totalDinners = personRsvps.filter((r) => {
      const dinner = r.dinner;
      return (dinner && dinner.enabled) || r.wants_dinner === true;
    }).length;
    const totalDinnerGuests = personRsvps.reduce((sum, r) => {
      const dinner = r.dinner;
      const wantsDinner = (dinner && dinner.enabled) || r.wants_dinner;
      const partySize = (dinner && dinner.partySize) || r.dinner_party_size;
      return sum + (wantsDinner && partySize ? partySize : 0);
    }, 0);

    // Get event details for each RSVP
    const eventHistory = personRsvps
      .map((rsvp) => {
        const event = rsvp.events || {};
        const dinner = rsvp.dinner || {};
        return {
          rsvpId: rsvp.id,
          eventId: rsvp.event_id,
          eventTitle: event.title || "Unknown Event",
          eventSlug: event.slug || null,
          eventDate: event.starts_at || null,
          status: rsvp.booking_status || rsvp.status,
          plusOnes: rsvp.plus_ones || 0,
          wantsDinner: (dinner && dinner.enabled) || rsvp.wants_dinner || false,
          dinnerStatus:
            (dinner && dinner.bookingStatus) || rsvp.dinner_status || null,
          dinnerTimeSlot:
            (dinner && dinner.slotTime) || rsvp.dinner_time_slot || null,
          dinnerPartySize:
            (dinner && dinner.partySize) || rsvp.dinner_party_size || null,
          rsvpDate: rsvp.created_at,
        };
      })
      .sort((a, b) => {
        // Sort by event date (most recent first)
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return new Date(b.eventDate) - new Date(a.eventDate);
      });

    return {
      ...mapPersonFromDb(dbPerson),
      stats: {
        totalEvents,
        eventsAttended,
        eventsWaitlisted,
        totalGuestsBrought,
        totalDinners,
        totalDinnerGuests,
      },
      eventHistory,
    };
  });

  // Sort by most recent activity
  return peopleWithStats.sort((a, b) => {
    const aLatest = a.eventHistory[0]?.rsvpDate || a.createdAt;
    const bLatest = b.eventHistory[0]?.rsvpDate || b.createdAt;
    return new Date(bLatest) - new Date(aLatest);
  });
}

// Get people with advanced filtering and pagination
export async function getPeopleWithFilters(
  userId,
  filters = {},
  sortBy = "created_at",
  sortOrder = "desc",
  limit = 50,
  offset = 0,
  { sendableOnly = false } = {}
) {
  if (!userId) {
    return { people: [], total: 0 };
  }

  // Get all event IDs for this user (owner or co-host) with titles for debugging
  const { data: userEvents, error: eventsError } = await supabase
    .from("events")
    .select("id, title, slug");

  if (eventsError) {
    console.error("[CRM Filter] Error fetching events:", eventsError);
    return { people: [], total: 0 };
  }

  // Filter events to only those where user is host (using join + legacy host_id)
  const eventIds = await getUserEventIds(userId);

  if (!eventIds || eventIds.length === 0) {
    console.log(`[CRM Filter] User ${userId} has no events (as host)`);
    return { people: [], total: 0 };
  }

  // Limit userEvents list to only events where user is host
  const userEventsMap = new Map(userEvents.map((e) => [e.id, e]));
  const filteredUserEvents = eventIds
    .map((id) => userEventsMap.get(id))
    .filter(Boolean);

  // attendedEventTags: resolve to the host's events whose admin_tags overlap
  // with the requested tags. Result narrows attendedEventIds (intersect if
  // both are provided, replace if only tags are provided).
  if (
    Array.isArray(filters.attendedEventTags) &&
    filters.attendedEventTags.length > 0
  ) {
    const requestedTags = filters.attendedEventTags
      .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
      .filter(Boolean);
    if (requestedTags.length > 0) {
      const { data: taggedEvents, error: tagErr } = await supabase
        .from("events")
        .select("id")
        .in("id", eventIds)
        .overlaps("admin_tags", requestedTags);
      if (tagErr) {
        console.error("[CRM Filter] tag resolve error:", tagErr.message);
        return { people: [], total: 0 };
      }
      const matchingIds = (taggedEvents || []).map((e) => e.id);
      if (matchingIds.length === 0) {
        console.log("[CRM Filter] No events matched requested tags:", requestedTags);
        return { people: [], total: 0 };
      }
      if (filters.attendedEventIds && filters.attendedEventIds.length > 0) {
        const explicit = filters.attendedEventIds.map((id) => String(id));
        filters.attendedEventIds = matchingIds.filter((id) =>
          explicit.includes(String(id)),
        );
        if (filters.attendedEventIds.length === 0) {
          return { people: [], total: 0 };
        }
      } else {
        filters.attendedEventIds = matchingIds;
      }
    }
  }

  // Debug: Log event titles to help identify specific events
  if (filters.attendedEventId) {
    const matchingEvent = filteredUserEvents.find(
      (e) => String(e.id) === String(filters.attendedEventId)
    );
    console.log(
      `[CRM Filter] Looking for event ID: ${filters.attendedEventId}`,
      matchingEvent
        ? `Found: "${matchingEvent.title}" (slug: ${matchingEvent.slug})`
        : "NOT FOUND in user's events"
    );
    console.log(
      `[CRM Filter] User has ${filteredUserEvents.length} events as host. Sample titles:`,
      filteredUserEvents.slice(0, 5).map((e) => `${e.title} (${e.id})`)
    );
  }

  // STEP 1: First filter RSVPs based on event-based filters
  // This determines which people we're interested in
  let rsvpQuery = supabase
    .from("rsvps")
    .select(
      "person_id, event_id, booking_status, status, wants_dinner, dinner"
    );

  // Apply event-based filters
  if (filters.attendedEventIds && filters.attendedEventIds.length > 0) {
    const requestedIds = filters.attendedEventIds.map((id) => String(id));
    const eventIdsStr = eventIds.map((id) => String(id));

    const validIds = requestedIds.filter((id) => eventIdsStr.includes(id));

    if (validIds.length === 0) {
      console.warn(
        `[CRM Filter] None of the requested attendedEventIds belong to user ${userId}.`
      );
      return { people: [], total: 0 };
    }

    console.log(
      `[CRM Filter] Filtering RSVPs by multiple event_ids:`,
      validIds
    );
    rsvpQuery = rsvpQuery.in("event_id", validIds);
  } else if (filters.attendedEventId) {
    // Verify the event belongs to this user
    const eventIdStr = String(filters.attendedEventId);
    const eventIdsStr = eventIds.map((id) => String(id));

    if (!eventIdsStr.includes(eventIdStr)) {
      console.warn(
        `[CRM Filter] Event ${eventIdStr} does not belong to user ${userId}. User has ${eventIds.length} events as host.`
      );
      console.warn(
        `[CRM Filter] User's event IDs:`,
        eventIdsStr.slice(0, 5),
        eventIds.length > 5 ? `... (${eventIds.length} total)` : ""
      );
      return { people: [], total: 0 };
    }
    console.log(
      `[CRM Filter] Filtering RSVPs by event_id: ${eventIdStr} (verified ownership)`
    );
    // When filtering by specific event, query only that event (not all user events)
    rsvpQuery = rsvpQuery.eq("event_id", eventIdStr);
  } else {
    // When not filtering by specific event, query all user's events
    rsvpQuery = rsvpQuery.in("event_id", eventIds);
  }

  if (filters.attendanceStatus) {
    if (filters.attendanceStatus === "attended") {
      // Use .or() with proper syntax for Supabase
      rsvpQuery = rsvpQuery.or(
        "booking_status.eq.CONFIRMED,status.eq.attending"
      );
    } else if (filters.attendanceStatus === "waitlisted") {
      rsvpQuery = rsvpQuery.or("booking_status.eq.WAITLIST,status.eq.waitlist");
    } else if (filters.attendanceStatus === "confirmed") {
      rsvpQuery = rsvpQuery.eq("booking_status", "CONFIRMED");
    }
  }

  // Note: hasDinner filter will be applied in JavaScript after fetching
  // since it requires checking both wants_dinner and dinner.enabled (JSONB field)

  const { data: allRsvps, error: rsvpsError } = await rsvpQuery;

  if (rsvpsError) {
    console.error(
      "[CRM Filter] Error fetching RSVPs for filtering:",
      rsvpsError
    );
    console.error("[CRM Filter] Query details:", {
      eventIds: eventIds.length,
      attendedEventId: filters.attendedEventId,
      attendanceStatus: filters.attendanceStatus,
    });
    return { people: [], total: 0 };
  }

  // Debug logging
  console.log(
    `[CRM Filter] Found ${allRsvps?.length || 0} RSVPs matching criteria`,
    filters.attendedEventId
      ? `for event ${filters.attendedEventId}`
      : "for all user events"
  );

  // If no RSVPs match, return empty
  if (!allRsvps || allRsvps.length === 0) {
    console.log(
      `[CRM Filter] No RSVPs found. Filters:`,
      JSON.stringify(
        {
          attendedEventId: filters.attendedEventId,
          attendanceStatus: filters.attendanceStatus,
          hasDinner: filters.hasDinner,
          eventsAttendedMin: filters.eventsAttendedMin,
          eventsAttendedMax: filters.eventsAttendedMax,
        },
        null,
        2
      )
    );
    return { people: [], total: 0 };
  }

  // Group RSVPs by person to calculate event counts
  // Also filter by hasDinner if specified
  const rsvpsByPerson = {};
  let rsvpsAfterDinnerFilter = 0;
  (allRsvps || []).forEach((rsvp) => {
    // Filter by hasDinner if specified
    if (filters.hasDinner !== undefined) {
      const wantsDinner = rsvp.wants_dinner === true;
      const dinnerEnabled =
        rsvp.dinner &&
        typeof rsvp.dinner === "object" &&
        rsvp.dinner.enabled === true;
      const hadDinner = wantsDinner || dinnerEnabled;

      if (filters.hasDinner && !hadDinner) {
        return; // Skip this RSVP if we want people with dinner but this one doesn't have it
      }
      if (!filters.hasDinner && hadDinner) {
        return; // Skip this RSVP if we want people without dinner but this one has it
      }
    }

    rsvpsAfterDinnerFilter++;
    if (!rsvpsByPerson[rsvp.person_id]) {
      rsvpsByPerson[rsvp.person_id] = [];
    }
    rsvpsByPerson[rsvp.person_id].push(rsvp);
  });

  console.log(
    `[CRM Filter] After dinner filter: ${rsvpsAfterDinnerFilter} RSVPs, ${
      Object.keys(rsvpsByPerson).length
    } unique people`
  );

  // Filter by events attended count if specified
  // Note: person_id from RSVPs is already a UUID string, so we can use it directly
  // Object.keys() returns strings, and person_id from database is UUID (string)
  let personIdsWithRsvps = new Set(Object.keys(rsvpsByPerson));

  console.log(
    `[CRM Filter] After grouping: ${
      personIdsWithRsvps.size
    } unique people from ${Object.values(rsvpsByPerson).reduce(
      (sum, arr) => sum + arr.length,
      0
    )} RSVPs`
  );

  // Log sample person IDs to verify format
  if (personIdsWithRsvps.size > 0) {
    const sampleIds = Array.from(personIdsWithRsvps).slice(0, 2);
    console.log(`[CRM Filter] Sample person IDs:`, sampleIds);
  }

  if (
    filters.eventsAttendedMin !== undefined ||
    filters.eventsAttendedMax !== undefined
  ) {
    const minEvents = filters.eventsAttendedMin || 0;
    const maxEvents = filters.eventsAttendedMax || Infinity;

    personIdsWithRsvps = new Set(
      Object.keys(rsvpsByPerson).filter((personId) => {
        const personRsvps = rsvpsByPerson[personId];
        const attendedCount = personRsvps.filter(
          (r) => r.booking_status === "CONFIRMED" || r.status === "attending"
        ).length;
        return attendedCount >= minEvents && attendedCount <= maxEvents;
      })
    );
  }

  // STEP 2: Now query people, but ONLY those who match our RSVP filters
  if (personIdsWithRsvps.size === 0) {
    console.log(
      `[CRM Filter] No person IDs after RSVP filtering. Filters:`,
      JSON.stringify(
        {
          attendedEventId: filters.attendedEventId,
          attendanceStatus: filters.attendanceStatus,
          hasDinner: filters.hasDinner,
          eventsAttendedMin: filters.eventsAttendedMin,
          eventsAttendedMax: filters.eventsAttendedMax,
        },
        null,
        2
      )
    );
    return { people: [], total: 0 };
  }

  const personIdsArray = Array.from(personIdsWithRsvps);
  console.log(
    `[CRM Filter] Querying ${personIdsArray.length} people from RSVP criteria. First 3 person IDs:`,
    personIdsArray.slice(0, 3)
  );

  // Build query for people - start with person_id filter
  // Note: Supabase .in() has limits (typically ~100-200 items), so we batch large queries
  const BATCH_SIZE = 100; // Safe batch size for Supabase .in() queries

  let allPeople = [];
  let totalCount = 0;

  if (personIdsArray.length === 0) {
    return { people: [], total: 0 };
  }

  // Log the query we're about to execute
  console.log(
    `[CRM Filter] People query: SELECT * FROM people WHERE id IN (${personIdsArray.length} IDs) - batching into chunks of ${BATCH_SIZE}`
  );

  // Batch the person IDs into smaller chunks
  for (let i = 0; i < personIdsArray.length; i += BATCH_SIZE) {
    const batch = personIdsArray.slice(i, i + BATCH_SIZE);

    let query = supabase
      .from("people")
      .select("*", { count: "exact" })
      .in("id", batch);

    // Apply other filters (email, name, search, etc.)
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      query = query.or(
        `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,instagram.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
      );
    }

    if (filters.email) {
      query = query.ilike("email", `%${filters.email}%`);
    }

    if (filters.name) {
      query = query.ilike("name", `%${filters.name}%`);
    }

    if (filters.totalSpendMin !== undefined) {
      query = query.gte("total_spend", filters.totalSpendMin);
    }

    if (filters.totalSpendMax !== undefined) {
      query = query.lte("total_spend", filters.totalSpendMax);
    }

    if (filters.paymentCountMin !== undefined) {
      query = query.gte("payment_count", filters.paymentCountMin);
    }

    if (filters.paymentCountMax !== undefined) {
      query = query.lte("payment_count", filters.paymentCountMax);
    }

    if (filters.subscriptionType) {
      query = query.eq("subscription_type", filters.subscriptionType);
    }

    if (filters.interestedIn) {
      query = query.ilike("interested_in", `%${filters.interestedIn}%`);
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.contains("tags", filters.tags);
    }

    if (filters.hasStripeCustomerId !== undefined) {
      if (filters.hasStripeCustomerId) {
        query = query.not("stripe_customer_id", "is", null);
      } else {
        query = query.is("stripe_customer_id", null);
      }
    }

    // Fetch all results from this batch (no pagination yet - we'll paginate after combining)
    const {
      data: batchPeople,
      error: batchError,
      count: batchCount,
    } = await query;

    if (batchError) {
      console.error(
        `[CRM Filter] Error fetching people batch ${i / BATCH_SIZE + 1}:`,
        batchError
      );
      // Continue with other batches even if one fails
      continue;
    }

    if (batchPeople) {
      allPeople = allPeople.concat(batchPeople);
    }
    if (batchCount !== null) {
      totalCount += batchCount;
    }
  }

  // Remove duplicates (in case any person appears in multiple batches due to filters)
  let uniquePeople = Array.from(
    new Map(allPeople.map((p) => [p.id, p])).values()
  );

  // Sendable-only filter: drop people we can't actually email (no address,
  // unsubscribed from marketing, or on the global suppression list from
  // bounces/complaints). Applied here — before sort/pagination — so the
  // total count surfaced to the caller reflects the deliverable audience.
  if (sendableOnly) {
    const before = uniquePeople.length;
    // 1) drop people without an email or who've unsubscribed
    uniquePeople = uniquePeople.filter(
      (p) => !!p.email && !p.marketing_unsubscribed_at,
    );
    // 2) drop people whose address is on the suppression list (bounce/complaint)
    if (uniquePeople.length > 0) {
      const { getSuppressedEmailSet } = await import(
        "../email/repos/emailSuppressionsRepo.js"
      );
      const suppressed = await getSuppressedEmailSet(
        uniquePeople.map((p) => p.email),
      );
      if (suppressed.size > 0) {
        uniquePeople = uniquePeople.filter(
          (p) => !suppressed.has(String(p.email).toLowerCase()),
        );
      }
    }
    if (before !== uniquePeople.length) {
      console.log(
        `[CRM Filter] sendableOnly: dropped ${before - uniquePeople.length} non-sendable (of ${before})`,
      );
    }
  }

  // Sort
  const validSortFields = [
    "created_at",
    "updated_at",
    "name",
    "email",
    "total_spend",
    "payment_count",
  ];
  const sortField = validSortFields.includes(sortBy) ? sortBy : "created_at";
  const sortDir = sortOrder === "asc" ? "asc" : "desc";

  uniquePeople.sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (sortDir === "asc") {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  // Apply pagination after sorting
  const paginatedPeople = uniquePeople.slice(offset, offset + limit);
  const count = uniquePeople.length; // Use actual filtered count, not totalCount from batches

  const people = paginatedPeople;
  const error = null; // No error if we got here

  if (error) {
    console.error("[CRM Filter] Error fetching people with filters:", error);
    return { people: [], total: 0 };
  }

  console.log(
    `[CRM Filter] Found ${people?.length || 0} people (total count: ${
      count || 0
    })`
  );

  // STEP 3: Enrich people with event history and stats (like getAllPeopleWithStats does)
  // Fetch all RSVPs for these people to build event history
  const peopleIds = (people || []).map((p) => p.id);

  if (peopleIds.length === 0) {
    return { people: [], total: count || 0 };
  }

  // Fetch RSVPs with event details for these people
  // Note: We fetch ALL RSVPs for these people across ALL user events to build complete event history
  console.log(
    `[CRM Filter] Fetching event history for ${peopleIds.length} people across ${eventIds.length} events`
  );
  console.log(
    `[CRM Filter] Event IDs for history query:`,
    eventIds.slice(0, 5),
    eventIds.length > 5 ? `... (${eventIds.length} total)` : ""
  );

  // Bounded by the host's events (eventIds); the person_id filter was the
  // oversized redundant one (a big .in() 400s) — rsvps for people outside this
  // page are simply not attached downstream.
  const { data: allRsvpsForPeople, error: rsvpsError2 } = await supabase
    .from("rsvps")
    .select(
      `
      *,
      events:event_id (
        id,
        title,
        slug,
        starts_at
      )
    `
    )
    .in("event_id", eventIds);

  // Note: The * selector includes all RSVP fields including:
  // - pulled_up, pulled_up_count, pulled_up_for_dinner, pulled_up_for_cocktails
  // - dinner_pull_up_count, cocktail_only_pull_up_count
  // - wants_dinner, dinner (JSONB), booking_status, status

  if (rsvpsError2) {
    console.error(
      "[CRM Filter] Error fetching RSVPs for event history:",
      rsvpsError2
    );
    // Return people without event history if RSVP fetch fails
    return {
      people: (people || []).map((p) => mapPersonFromDb(p)),
      total: count || 0,
    };
  }

  // Fallback: If any RSVPs are missing event data from the join, fetch events separately
  // This can happen if the Supabase foreign key relationship isn't properly configured
  const rsvpsMissingEventData = (allRsvpsForPeople || []).filter(
    (r) => !r.events && r.event_id
  );
  if (rsvpsMissingEventData.length > 0) {
    console.log(
      `[CRM Filter] Found ${rsvpsMissingEventData.length} RSVPs with missing event data, fetching events separately`
    );
    const missingEventIds = [
      ...new Set(rsvpsMissingEventData.map((r) => r.event_id)),
    ];
    const { data: missingEvents, error: eventsError } = await supabase
      .from("events")
      .select("id, title, slug, starts_at")
      .in("id", missingEventIds);

    if (!eventsError && missingEvents) {
      // Create a map of event_id -> event data
      const eventMap = {};
      missingEvents.forEach((e) => {
        eventMap[e.id] = e;
      });
      // Attach event data to RSVPs that were missing it
      allRsvpsForPeople.forEach((rsvp) => {
        if (!rsvp.events && rsvp.event_id && eventMap[rsvp.event_id]) {
          rsvp.events = eventMap[rsvp.event_id];
        }
      });
    }
  }

  // Debug: Log RSVPs fetched for event history
  console.log(
    `[CRM Filter] Fetched ${
      allRsvpsForPeople?.length || 0
    } RSVPs for event history`
  );
  if (allRsvpsForPeople && allRsvpsForPeople.length > 0) {
    const sampleRsvp = allRsvpsForPeople[0];
    console.log(`[CRM Filter] Sample RSVP for event history:`, {
      person_id: sampleRsvp.person_id,
      event_id: sampleRsvp.event_id,
      has_events_join: !!sampleRsvp.events,
      events_data: sampleRsvp.events,
    });
    // Check for Kaijas Musiksalong specifically
    const kaijasRsvps = allRsvpsForPeople.filter(
      (r) => r.event_id === "e4ab5149-9e55-437b-9e05-9289207201b4"
    );
    if (kaijasRsvps.length > 0) {
      console.log(
        `[CRM Filter] Found ${kaijasRsvps.length} Kaijas Musiksalong RSVPs in event history query`
      );
      console.log(
        `[CRM Filter] Sample Kaijas RSVP events join:`,
        kaijasRsvps[0].events
      );
    }
  }

  // Group RSVPs by person
  const rsvpsByPersonForHistory = {};
  (allRsvpsForPeople || []).forEach((rsvp) => {
    if (!rsvpsByPersonForHistory[rsvp.person_id]) {
      rsvpsByPersonForHistory[rsvp.person_id] = [];
    }
    rsvpsByPersonForHistory[rsvp.person_id].push(rsvp);
  });

  // Enrich each person with stats and event history
  const enrichedPeople = (people || []).map((dbPerson) => {
    const personRsvps = rsvpsByPersonForHistory[dbPerson.id] || [];

    const eventsAttended = personRsvps.filter(
      (r) => r.booking_status === "CONFIRMED" || r.status === "attending"
    ).length;
    const eventsWaitlisted = personRsvps.filter(
      (r) => r.booking_status === "WAITLIST" || r.status === "waitlist"
    ).length;
    const totalEvents = personRsvps.length;
    const totalGuestsBrought = personRsvps.reduce(
      (sum, r) => sum + (r.plus_ones || 0),
      0
    );
    const totalDinners = personRsvps.filter((r) => {
      const dinner = r.dinner || {};
      return (dinner && dinner.enabled) || r.wants_dinner === true;
    }).length;
    const totalDinnerGuests = personRsvps.reduce((sum, r) => {
      const dinner = r.dinner || {};
      const wantsDinner = (dinner && dinner.enabled) || r.wants_dinner;
      const partySize = (dinner && dinner.partySize) || r.dinner_party_size;
      return sum + (wantsDinner && partySize ? partySize : 0);
    }, 0);

    // Get event details for each RSVP
    const eventHistory = personRsvps
      .map((rsvp) => {
        // Handle Supabase join - events can be an object or null
        // The join syntax `events:event_id` should return an object, but may be null if join fails
        const event = rsvp.events || null;
        const dinner = rsvp.dinner || {};

        // Debug: Log if event join is missing for Kaijas Musiksalong
        if (
          rsvp.event_id === "e4ab5149-9e55-437b-9e05-9289207201b4" &&
          !event
        ) {
          console.warn(
            `[CRM Filter] Missing event join for Kaijas Musiksalong RSVP:`,
            {
              rsvp_id: rsvp.id,
              person_id: rsvp.person_id,
              event_id: rsvp.event_id,
              has_events: !!rsvp.events,
              events_value: rsvp.events,
            }
          );
        }

        // Determine event type: cocktails only vs dinner
        const wantsDinner =
          (dinner && dinner.enabled) || rsvp.wants_dinner || false;
        const eventType = wantsDinner ? "dinner" : "cocktails";

        // Calculate booked counts
        const partySize = rsvp.party_size || 1;
        const dinnerPartySize =
          (dinner && dinner.partySize) || rsvp.dinner_party_size || 0;
        const plusOnes = rsvp.plus_ones || 0;

        // Cocktails booked: if dinner, it's plusOnes (cocktails-only guests), otherwise partySize
        const cocktailsBooked = wantsDinner ? plusOnes : partySize;
        // Dinner booked: dinnerPartySize if wantsDinner, otherwise 0
        const dinnerBooked = wantsDinner ? dinnerPartySize : 0;

        // Get attendance counts by type
        const cocktailsAttended = rsvp.pulled_up_for_cocktails
          ? rsvp.cocktail_only_pull_up_count || 0
          : 0;
        const dinnerAttended = rsvp.pulled_up_for_dinner
          ? rsvp.dinner_pull_up_count || 0
          : 0;

        // Determine attendance status: confirmed vs actually attended
        const isConfirmed = rsvp.booking_status === "CONFIRMED";
        // Attended if any guests actually pulled up (cocktails or dinner)
        const actuallyAttended =
          rsvp.pulled_up === true ||
          cocktailsAttended > 0 ||
          dinnerAttended > 0;
        const attendanceStatus = actuallyAttended
          ? "attended"
          : isConfirmed
          ? "confirmed"
          : "waitlisted";

        return {
          rsvpId: rsvp.id,
          eventId: rsvp.event_id,
          eventTitle: event?.title || "Unknown Event",
          eventSlug: event?.slug || null,
          eventDate: event?.starts_at || null,
          status: rsvp.booking_status || rsvp.status,
          plusOnes: rsvp.plus_ones || 0,
          wantsDinner,
          eventType, // "cocktails" | "dinner"
          attendanceStatus, // "confirmed" | "attended" | "waitlisted"
          actuallyAttended, // boolean - did they actually show up?
          cocktailsBooked, // number of cocktails guests booked
          cocktailsAttended, // number of cocktails guests who attended
          dinnerBooked, // number of dinner guests booked
          dinnerAttended, // number of dinner guests who attended
          dinnerStatus:
            (dinner && dinner.bookingStatus) || rsvp.dinner_status || null,
          dinnerTimeSlot:
            (dinner && dinner.slotTime) || rsvp.dinner_time_slot || null,
          dinnerPartySize:
            (dinner && dinner.partySize) || rsvp.dinner_party_size || null,
          rsvpDate: rsvp.created_at,
        };
      })
      .sort((a, b) => {
        // Sort by event date (most recent first)
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return new Date(b.eventDate) - new Date(a.eventDate);
      });

    return {
      ...mapPersonFromDb(dbPerson),
      stats: {
        totalEvents,
        eventsAttended,
        eventsWaitlisted,
        totalGuestsBrought,
        totalDinners,
        totalDinnerGuests,
      },
      eventHistory,
    };
  });

  // Apply optional per-person exclusions (e.g. manual removals from a segment)
  let finalPeople = enrichedPeople;
  if (filters.excludePersonIds && filters.excludePersonIds.length > 0) {
    const excludeSet = new Set(filters.excludePersonIds.map((id) => String(id)));
    finalPeople = enrichedPeople.filter(
      (person) => !excludeSet.has(String(person.id))
    );
  }

  return {
    people: finalPeople,
    total: count || finalPeople.length,
  };
}

// Get person touchpoints (RSVPs, payments, emails)
export async function getPersonTouchpoints(personId, userId) {
  if (!personId || !userId) {
    return { rsvps: [], payments: [], emails: [] };
  }

  // Verify user has access (person must have RSVP'd to user's events)
  const { data: userEvents } = await supabase
    .from("events")
    .select("id")
    .eq("host_id", userId);

  if (!userEvents || userEvents.length === 0) {
    return { rsvps: [], payments: [], emails: [] };
  }

  const eventIds = userEvents.map((e) => e.id);

  // Get RSVPs
  const { data: rsvps, error: rsvpsError } = await supabase
    .from("rsvps")
    .select(
      `
      *,
      events:event_id (
        id,
        title,
        slug,
        starts_at
      )
    `
    )
    .eq("person_id", personId)
    .in("event_id", eventIds)
    .order("created_at", { ascending: false });

  // Get payments (via RSVPs or directly linked)
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .in("event_id", eventIds)
    .or(`rsvp_id.in.(${rsvps?.map((r) => r.id).join(",") || ""})`)
    .order("created_at", { ascending: false });

  return {
    rsvps: (rsvps || []).map((rsvp) => ({
      id: rsvp.id,
      eventId: rsvp.event_id,
      eventTitle: rsvp.events?.title || "Unknown Event",
      eventSlug: rsvp.events?.slug || null,
      eventDate: rsvp.events?.starts_at || null,
      status: rsvp.booking_status || rsvp.status,
      createdAt: rsvp.created_at,
    })),
    payments: (payments || []).map((payment) => ({
      id: payment.id,
      eventId: payment.event_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.created_at,
      paidAt: payment.paid_at,
    })),
    emails: [],
  };
}

// Helper: Map database RSVP to application format

export async function getNewsletterSubscribers({
  status = "confirmed",
  limit = 10000,
  targetCategories = [],
} = {}) {
  const { data, error, count } = await supabase
    .from("newsletter_subscriptions")
    .select("id, email, user_id, status, interests, unsubscribe_token", { count: "exact" })
    .eq("status", status)
    .limit(limit);

  if (error) {
    console.error("[getNewsletterSubscribers] Error:", error);
    throw error;
  }

  let subscribers = data || [];

  // If targeting specific categories, include subscribers who:
  // 1. Have at least one matching interest, OR
  // 2. Have no interests set (they get everything)
  if (Array.isArray(targetCategories) && targetCategories.length > 0) {
    const targets = new Set(targetCategories.map((c) => c.toLowerCase()));
    subscribers = subscribers.filter((s) => {
      const interests = Array.isArray(s.interests) ? s.interests : [];
      if (interests.length === 0) return true;
      return interests.some((i) => targets.has(i.toLowerCase()));
    });
  }

  return {
    subscribers,
    total: subscribers.length,
    unfilteredTotal: typeof count === "number" ? count : (data || []).length,
  };
}

// Helper: Map database profile to application format

export async function ensureUnsubscribeToken(personId) {
  const { data, error } = await supabase
    .from("people")
    .select("marketing_unsubscribe_token")
    .eq("id", personId)
    .single();
  if (error) throw error;
  if (data?.marketing_unsubscribe_token) return data.marketing_unsubscribe_token;
  const token = crypto.randomBytes(24).toString("hex");
  const { error: updateError } = await supabase
    .from("people")
    .update({ marketing_unsubscribe_token: token })
    .eq("id", personId);
  if (updateError) throw updateError;
  return token;
}

export async function findPersonByUnsubscribeToken(token) {
  if (!token || typeof token !== "string") return null;
  const { data, error } = await supabase
    .from("people")
    .select("id, email, name, marketing_unsubscribed_at")
    .eq("marketing_unsubscribe_token", token)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function setMarketingUnsubscribed(personId, unsubscribed) {
  const { error } = await supabase
    .from("people")
    .update({ marketing_unsubscribed_at: unsubscribed ? new Date().toISOString() : null })
    .eq("id", personId);
  if (error) throw error;
}

// ---------------------------
// CRM follow-up image gallery
// ---------------------------
