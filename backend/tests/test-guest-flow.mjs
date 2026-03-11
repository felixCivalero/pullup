/**
 * Comprehensive RSVP + Guest Management Flow Tests
 * Tests against real Supabase DB using data.js functions directly.
 *
 * Run: node backend/tests/test-guest-flow.mjs
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

import {
  addRsvp,
  updateRsvp,
  deleteRsvp,
  findRsvpById,
  getRsvpsForEvent,
  getEventCounts,
  getCocktailsOnlyCount,
} from "../src/data.js";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
const failures = [];
const cleanupIds = { events: [], rsvps: [], people: [] };

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ❌ ${message}`);
  }
}

// Create a test event directly in DB
async function createTestEvent(overrides = {}) {
  const slug = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const defaults = {
    title: "Test Event",
    slug,
    description: "Test event for guest flow",
    location: "Test Location",
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    ends_at: new Date(Date.now() + 86400000 + 3600000).toISOString(),
    timezone: "Europe/Stockholm",
    // no max_attendees column - use total_capacity
    waitlist_enabled: true,
    dinner_enabled: false,
    cocktail_capacity: 5,  // Small for easy testing
    total_capacity: 10,
    max_plus_ones_per_guest: 3,
    ticket_type: "free",
    status: "PUBLISHED",
  };
  const eventData = { ...defaults, ...overrides };
  const { data, error } = await supabase.from("events").insert(eventData).select().single();
  if (error) throw new Error(`Failed to create test event: ${error.message}`);
  cleanupIds.events.push(data.id);
  return data;
}

// Map DB event to app format (mimicking data.js mapEventFromDb)
function mapEvent(dbEvent) {
  return {
    id: dbEvent.id,
    slug: dbEvent.slug,
    title: dbEvent.title,
    cocktailCapacity: dbEvent.cocktail_capacity,
    totalCapacity: dbEvent.total_capacity,
    maxPlusOnesPerGuest: dbEvent.max_plus_ones_per_guest,
    waitlistEnabled: dbEvent.waitlist_enabled,
    dinnerEnabled: dbEvent.dinner_enabled,
    ticketType: dbEvent.ticket_type,
    ticketPrice: dbEvent.ticket_price,
    dinnerMaxSeatsPerSlot: dbEvent.dinner_max_seats_per_slot,
    startsAt: dbEvent.starts_at,
    endsAt: dbEvent.ends_at,
  };
}

function trackRsvp(rsvp) {
  if (rsvp?.id) cleanupIds.rsvps.push(rsvp.id);
  if (rsvp?.personId) cleanupIds.people.push(rsvp.personId);
}

// ===================================================================
// TEST SUITE 1: Free Event - Basic RSVP Flow
// ===================================================================
async function testFreeEventBasicFlow() {
  console.log("\n📋 TEST SUITE 1: Free Event - Basic RSVP Flow");

  const dbEvent = await createTestEvent({ cocktail_capacity: 5 });
  const slug = dbEvent.slug;

  // Test 1.1: Basic RSVP creation
  const r1 = await addRsvp({ slug, name: "Alice", email: "alice-test@test.com", plusOnes: 0 });
  trackRsvp(r1.rsvp);
  assert(!r1.error, "1.1 RSVP created without error");
  assert(r1.rsvp?.bookingStatus === "CONFIRMED", "1.1 Status is CONFIRMED");
  assert(r1.rsvp?.partySize === 1, "1.1 Party size is 1");

  // Test 1.2: RSVP with plus-ones
  const r2 = await addRsvp({ slug, name: "Bob", email: "bob-test@test.com", plusOnes: 2 });
  trackRsvp(r2.rsvp);
  assert(!r2.error, "1.2 RSVP with plus-ones created");
  assert(r2.rsvp?.partySize === 3, "1.2 Party size is 3 (1+2)");
  assert(r2.rsvp?.plusOnes === 2, "1.2 Plus-ones is 2");

  // Test 1.3: Duplicate RSVP (same email, same event)
  const r3 = await addRsvp({ slug, name: "Alice Dup", email: "alice-test@test.com", plusOnes: 0 });
  assert(r3.error === "duplicate", "1.3 Duplicate RSVP rejected");

  // Test 1.4: Capacity check - should go to waitlist when cocktail capacity exceeded
  // Currently: Alice (1) + Bob (3) = 4 cocktails-only out of 5
  const r4 = await addRsvp({ slug, name: "Charlie", email: "charlie-test@test.com", plusOnes: 2 });
  trackRsvp(r4.rsvp);
  // Charlie wants 3 spots, but only 1 left (5 - 4 = 1), should be waitlisted
  assert(r4.rsvp?.bookingStatus === "WAITLIST", "1.4 Charlie waitlisted (3 spots, only 1 left)");

  // Test 1.5: Another guest that fits
  const r5 = await addRsvp({ slug, name: "Dana", email: "dana-test@test.com", plusOnes: 0 });
  trackRsvp(r5.rsvp);
  assert(r5.rsvp?.bookingStatus === "CONFIRMED", "1.5 Dana confirmed (1 spot, 1 left)");

  // Test 1.6: Now truly full
  const r6 = await addRsvp({ slug, name: "Eve", email: "eve-test@test.com", plusOnes: 0 });
  trackRsvp(r6.rsvp);
  assert(r6.rsvp?.bookingStatus === "WAITLIST", "1.6 Eve waitlisted (0 spots left)");

  return { eventId: dbEvent.id, rsvps: { alice: r1.rsvp, bob: r2.rsvp, charlie: r4.rsvp, dana: r5.rsvp, eve: r6.rsvp } };
}

// ===================================================================
// TEST SUITE 2: Promote/Cancel from Dashboard
// ===================================================================
async function testPromoteCancelFlow(suite1Result) {
  console.log("\n📋 TEST SUITE 2: Promote / Cancel from Dashboard");

  const { eventId, rsvps } = suite1Result;

  // Test 2.1: Promote waitlisted guest (Charlie)
  const promoteResult = await updateRsvp(
    rsvps.charlie.id,
    { bookingStatus: "CONFIRMED", status: "attending" },
    { forceConfirm: true }
  );
  assert(!promoteResult.error, "2.1 Charlie promoted without error");
  assert(promoteResult.rsvp?.bookingStatus === "CONFIRMED", "2.1 Charlie now CONFIRMED");

  // Verify Charlie's data preserved
  assert(promoteResult.rsvp?.plusOnes === 2, "2.1 Charlie's plus-ones preserved (2)");
  assert(promoteResult.rsvp?.partySize === 3, "2.1 Charlie's party size preserved (3)");

  // Test 2.2: Cancel a confirmed guest (Dana)
  const cancelResult = await updateRsvp(rsvps.dana.id, {
    bookingStatus: "CANCELLED",
    status: "cancelled",
  });
  assert(!cancelResult.error, "2.2 Dana cancelled without error");
  assert(cancelResult.rsvp?.bookingStatus === "CANCELLED", "2.2 Dana now CANCELLED");

  // Verify pull-up counts are reset
  assert(cancelResult.rsvp?.dinnerPullUpCount === 0, "2.2 Dana pull-up count reset to 0");
  assert(cancelResult.rsvp?.cocktailOnlyPullUpCount === 0, "2.2 Dana cocktail pull-up reset to 0");

  // Test 2.3: Cancel preserves record (not deleted)
  const danaAfter = await findRsvpById(rsvps.dana.id);
  assert(danaAfter !== null, "2.3 Cancelled RSVP still exists in DB");
  assert(danaAfter?.bookingStatus === "CANCELLED", "2.3 Cancelled status persisted");

  // Test 2.4: Promote Eve (was waitlisted)
  const promoteEve = await updateRsvp(
    rsvps.eve.id,
    { bookingStatus: "CONFIRMED", status: "attending" },
    { forceConfirm: true }
  );
  assert(!promoteEve.error, "2.4 Eve promoted without error");
  assert(promoteEve.rsvp?.bookingStatus === "CONFIRMED", "2.4 Eve now CONFIRMED");
  assert(promoteEve.rsvp?.capacityOverridden === true, "2.4 Eve marked as capacity overridden");
}

// ===================================================================
// TEST SUITE 3: Update Guest Edge Cases
// ===================================================================
async function testUpdateEdgeCases() {
  console.log("\n📋 TEST SUITE 3: Update Guest Edge Cases");

  const dbEvent = await createTestEvent({ cocktail_capacity: 10 });
  const slug = dbEvent.slug;

  // Create a confirmed guest with plus-ones
  const r1 = await addRsvp({ slug, name: "Frank", email: "frank-test@test.com", plusOnes: 3 });
  trackRsvp(r1.rsvp);

  // Test 3.1: Update plus-ones down
  const u1 = await updateRsvp(r1.rsvp.id, { plusOnes: 1 });
  assert(!u1.error, "3.1 Plus-ones reduced without error");
  assert(u1.rsvp?.plusOnes === 1, "3.1 Plus-ones now 1");
  assert(u1.rsvp?.partySize === 2, "3.1 Party size recalculated to 2");

  // Test 3.2: Set pull-up counts
  const u2 = await updateRsvp(r1.rsvp.id, { cocktailOnlyPullUpCount: 2 });
  assert(!u2.error, "3.2 Pull-up count set without error");
  assert(u2.rsvp?.cocktailOnlyPullUpCount === 2, "3.2 Cocktail pull-up is 2");

  // Test 3.3: Reduce party size below pull-up count (should clamp)
  const u3 = await updateRsvp(r1.rsvp.id, { plusOnes: 0 });
  assert(!u3.error, "3.3 Plus-ones reduced to 0");
  // Party size now 1, but cocktail pull-up was 2 - should be clamped
  assert(u3.rsvp?.partySize === 1, "3.3 Party size is 1");
  assert(u3.rsvp?.cocktailOnlyPullUpCount <= 1, "3.3 Cocktail pull-up clamped to <= party size");

  // Test 3.4: Move confirmed to waitlist
  const u4 = await updateRsvp(r1.rsvp.id, { bookingStatus: "WAITLIST", status: "waitlist" });
  assert(!u4.error, "3.4 Moved to waitlist without error");
  assert(u4.rsvp?.bookingStatus === "WAITLIST", "3.4 Status is WAITLIST");
  assert(u4.rsvp?.cocktailOnlyPullUpCount === 0, "3.4 Pull-up count reset on waitlist");

  // Test 3.5: Move back to confirmed
  const u5 = await updateRsvp(r1.rsvp.id, { bookingStatus: "CONFIRMED", status: "attending" }, { forceConfirm: true });
  assert(!u5.error, "3.5 Promoted back to confirmed");
  assert(u5.rsvp?.bookingStatus === "CONFIRMED", "3.5 Status is CONFIRMED");

  // Test 3.6: Update email to existing person's email (duplicate check)
  const r2 = await addRsvp({ slug, name: "Grace", email: "grace-test@test.com", plusOnes: 0 });
  trackRsvp(r2.rsvp);
  const u6 = await updateRsvp(r1.rsvp.id, { email: "grace-test@test.com" });
  // Should handle gracefully - either merge or reject
  assert(!u6.error || u6.error === "duplicate", "3.6 Email change to existing person handled");

  // Test 3.7: Invalid email
  const u7 = await updateRsvp(r1.rsvp.id, { email: "notanemail" });
  assert(u7.error === "invalid_email", "3.7 Invalid email rejected");

  // Test 3.8: Cancel then try to set pull-up
  await updateRsvp(r1.rsvp.id, { bookingStatus: "CANCELLED", status: "cancelled" });
  const u8 = await updateRsvp(r1.rsvp.id, { cocktailOnlyPullUpCount: 1 });
  assert(u8.rsvp?.cocktailOnlyPullUpCount === 0, "3.8 Pull-up count stays 0 for cancelled guest");
}

// ===================================================================
// TEST SUITE 4: Paid Event Flow
// ===================================================================
async function testPaidEventFlow() {
  console.log("\n📋 TEST SUITE 4: Paid Event Flow");

  const dbEvent = await createTestEvent({
    ticket_type: "paid",
    ticket_price: 200,
    ticket_currency: "SEK",
    cocktail_capacity: 3,
  });
  const slug = dbEvent.slug;

  // Test 4.1: RSVP to paid event
  const r1 = await addRsvp({ slug, name: "Helen", email: "helen-test@test.com", plusOnes: 0 });
  trackRsvp(r1.rsvp);
  assert(!r1.error, "4.1 RSVP created for paid event");
  assert(r1.rsvp?.bookingStatus === "CONFIRMED", "4.1 Status CONFIRMED (pre-payment)");
  assert(r1.rsvp?.paymentStatus === "unpaid", "4.1 Payment status is unpaid");

  // Test 4.2: Fill up the event
  const r2 = await addRsvp({ slug, name: "Ivan", email: "ivan-test@test.com", plusOnes: 1 });
  trackRsvp(r2.rsvp);
  assert(r2.rsvp?.bookingStatus === "CONFIRMED", "4.2 Ivan confirmed (2 spots, 2 used so far)");

  const r3 = await addRsvp({ slug, name: "Julia", email: "julia-test@test.com", plusOnes: 0 });
  trackRsvp(r3.rsvp);
  // 3/3 cocktail capacity used
  assert(r3.rsvp?.bookingStatus === "WAITLIST", "4.3 Julia waitlisted (event full - 3 cocktails used)");

  // Test 4.4: Simulate paid+confirmed (manually set payment status)
  const { error: payErr } = await supabase.from("rsvps").update({ payment_status: "paid" }).eq("id", r1.rsvp.id);
  assert(!payErr, "4.4 Payment status set to paid");

  // Test 4.5: Try to move paid+confirmed to waitlist (should be blocked by the API endpoint logic, but updateRsvp itself allows it)
  // The business rule blocking is in the API layer (index.js), not in data.js
  // So updateRsvp will allow it - the protection is in the endpoint
  const r1After = await findRsvpById(r1.rsvp.id);
  assert(r1After?.paymentStatus === "paid", "4.5 Helen's payment is confirmed as paid");

  // Test 4.6: Promote Julia from waitlist with forceConfirm
  const promoteJulia = await updateRsvp(
    r3.rsvp.id,
    { bookingStatus: "CONFIRMED", status: "attending" },
    { forceConfirm: true }
  );
  assert(!promoteJulia.error, "4.6 Julia promoted from waitlist");
  assert(promoteJulia.rsvp?.bookingStatus === "CONFIRMED", "4.6 Julia is CONFIRMED");
  assert(promoteJulia.rsvp?.capacityOverridden === true, "4.6 Julia marked as over capacity");
}

// ===================================================================
// TEST SUITE 5: Waitlist Enabled/Disabled
// ===================================================================
async function testWaitlistToggle() {
  console.log("\n📋 TEST SUITE 5: Waitlist Enabled/Disabled");

  // Event with waitlist DISABLED
  const dbEvent = await createTestEvent({
    cocktail_capacity: 2,
    waitlist_enabled: false,
  });
  const slug = dbEvent.slug;

  const r1 = await addRsvp({ slug, name: "Kate", email: "kate-test@test.com", plusOnes: 1 });
  trackRsvp(r1.rsvp);
  assert(r1.rsvp?.bookingStatus === "CONFIRMED", "5.1 Kate confirmed (2 spots)");

  // Try to add when full and waitlist disabled
  const r2 = await addRsvp({ slug, name: "Leo", email: "leo-test@test.com", plusOnes: 0 });
  if (r2.rsvp) trackRsvp(r2.rsvp);
  assert(r2.error === "full", "5.2 Leo gets 'full' error (no waitlist)");
}

// ===================================================================
// TEST SUITE 6: Delete RSVP
// ===================================================================
async function testDeleteRsvp() {
  console.log("\n📋 TEST SUITE 6: Delete RSVP");

  const dbEvent = await createTestEvent({ cocktail_capacity: 10 });
  const slug = dbEvent.slug;

  const r1 = await addRsvp({ slug, name: "Mia", email: "mia-test@test.com", plusOnes: 0 });
  trackRsvp(r1.rsvp);

  // Test 6.1: Delete RSVP
  const del = await deleteRsvp(r1.rsvp.id);
  assert(del.success === true, "6.1 RSVP deleted successfully");

  // Test 6.2: Verify deleted
  const after = await findRsvpById(r1.rsvp.id);
  assert(after === null, "6.2 RSVP no longer exists");

  // Test 6.3: Delete non-existent
  const del2 = await deleteRsvp("00000000-0000-0000-0000-000000000000");
  assert(del2.error === "not_found", "6.3 Deleting non-existent returns not_found");
}

// ===================================================================
// TEST SUITE 7: Marketing consent & edge cases
// ===================================================================
async function testMarketingConsent() {
  console.log("\n📋 TEST SUITE 7: Marketing Consent");

  const dbEvent = await createTestEvent({ cocktail_capacity: 10 });
  const slug = dbEvent.slug;

  const r1 = await addRsvp({ slug, name: "Nina", email: "nina-test@test.com", plusOnes: 0, marketingOptIn: true });
  trackRsvp(r1.rsvp);
  assert(!r1.error, "7.1 RSVP with marketing opt-in created");

  const r2 = await addRsvp({ slug, name: "Oscar", email: "oscar-test@test.com", plusOnes: 0, marketingOptIn: false });
  trackRsvp(r2.rsvp);
  assert(!r2.error, "7.2 RSVP without marketing opt-in created");
}

// ===================================================================
// TEST SUITE 8: Plus-ones clamping
// ===================================================================
async function testPlusOnesClamping() {
  console.log("\n📋 TEST SUITE 8: Plus-Ones Clamping");

  const dbEvent = await createTestEvent({ cocktail_capacity: 10, max_plus_ones_per_guest: 2 });
  const slug = dbEvent.slug;

  // Test 8.1: Requesting more plus-ones than allowed
  const r1 = await addRsvp({ slug, name: "Pat", email: "pat-test@test.com", plusOnes: 5 });
  trackRsvp(r1.rsvp);
  assert(r1.rsvp?.plusOnes === 2, "8.1 Plus-ones clamped to max (2)");
  assert(r1.rsvp?.partySize === 3, "8.1 Party size is 3 (1+2)");

  // Test 8.2: Negative plus-ones
  const r2 = await addRsvp({ slug, name: "Quinn", email: "quinn-test@test.com", plusOnes: -3 });
  trackRsvp(r2.rsvp);
  assert(r2.rsvp?.plusOnes === 0, "8.2 Negative plus-ones clamped to 0");

  // Test 8.3: Update to exceed max
  const u1 = await updateRsvp(r1.rsvp.id, { plusOnes: 10 });
  assert(u1.rsvp?.plusOnes === 2, "8.3 Update plus-ones clamped to max (2)");
}

// ===================================================================
// CLEANUP
// ===================================================================
async function cleanup() {
  console.log("\n🧹 Cleaning up test data...");

  // Delete RSVPs first (FK constraint)
  if (cleanupIds.rsvps.length > 0) {
    const { error: rsvpErr } = await supabase
      .from("rsvps")
      .delete()
      .in("id", cleanupIds.rsvps);
    if (rsvpErr) console.log(`  ⚠️ RSVP cleanup: ${rsvpErr.message}`);
    else console.log(`  Deleted ${cleanupIds.rsvps.length} test RSVPs`);
  }

  // Delete events
  if (cleanupIds.events.length > 0) {
    // First delete any remaining RSVPs for these events
    const { error: rsvpErr2 } = await supabase
      .from("rsvps")
      .delete()
      .in("event_id", cleanupIds.events);
    if (rsvpErr2) console.log(`  ⚠️ Event RSVP cleanup: ${rsvpErr2.message}`);

    const { error: eventErr } = await supabase
      .from("events")
      .delete()
      .in("id", cleanupIds.events);
    if (eventErr) console.log(`  ⚠️ Event cleanup: ${eventErr.message}`);
    else console.log(`  Deleted ${cleanupIds.events.length} test events`);
  }

  // Delete test people (by email pattern)
  const { error: peopleErr } = await supabase
    .from("people")
    .delete()
    .like("email", "%-test@test.com");
  if (peopleErr) console.log(`  ⚠️ People cleanup: ${peopleErr.message}`);
  else console.log("  Cleaned up test people");
}

// ===================================================================
// MAIN
// ===================================================================
async function main() {
  console.log("🧪 PullUp Guest Management - Comprehensive Flow Tests\n");
  console.log("=" .repeat(60));

  try {
    const suite1 = await testFreeEventBasicFlow();
    await testPromoteCancelFlow(suite1);
    await testUpdateEdgeCases();
    await testPaidEventFlow();
    await testWaitlistToggle();
    await testDeleteRsvp();
    await testMarketingConsent();
    await testPlusOnesClamping();
  } catch (err) {
    console.error("\n💥 Test suite crashed:", err);
    failed++;
  }

  await cleanup();

  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n❌ Failures:");
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main();
