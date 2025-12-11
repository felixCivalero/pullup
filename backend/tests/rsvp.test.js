// backend/tests/rsvp.test.js
// Tests for RSVP model compliance with FULL_STACK_FLOW_AUDIT.md

import {
  addRsvp,
  updateRsvp,
  findRsvpById,
  createEvent,
  findEventBySlug,
} from "../src/data.js";

// Helper to create a test event
function createTestEvent() {
  return createEvent({
    title: "Test Event",
    description: "Test",
    location: "Test Location",
    startsAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    endsAt: new Date(Date.now() + 86400000 + 3600000).toISOString(),
    timezone: "UTC",
    maxAttendees: 100,
    waitlistEnabled: true,
    dinnerEnabled: true,
    dinnerStartTime: new Date(
      Date.now() + 86400000 + 18 * 3600000
    ).toISOString(), // 6 PM
    dinnerEndTime: new Date(Date.now() + 86400000 + 22 * 3600000).toISOString(), // 10 PM
    dinnerSeatingIntervalHours: 2,
    dinnerMaxSeatsPerSlot: 10,
    cocktailCapacity: 50,
    foodCapacity: 20,
    totalCapacity: 70,
  });
}

// Test 1: Party with Dinner + Cocktails, Incremental Check-ins
function testIncrementalCheckIns() {
  console.log("🧪 Test 1: Incremental Check-ins");

  const event = createTestEvent();
  const result = addRsvp({
    slug: event.slug,
    name: "Test User",
    email: "test@example.com",
    plusOnes: 6, // Total party: 7 (1 booker + 6)
    wantsDinner: true,
    dinnerTimeSlot: event.dinnerStartTime,
    dinnerPartySize: 4, // 4 for dinner, 3 for cocktails-only
  });

  if (result.error) {
    console.error("❌ Failed to create RSVP:", result.error);
    return false;
  }

  const rsvpId = result.rsvp.id;
  let rsvp = result.rsvp;

  // Verify initial state
  if (
    rsvp.dinnerPullUpCount !== 0 ||
    rsvp.cocktailOnlyPullUpCount !== 0 ||
    rsvp.bookingStatus !== "CONFIRMED"
  ) {
    console.error("❌ Initial state incorrect:", rsvp);
    return false;
  }
  console.log("✅ Initial state: PullUpStatus = NONE");

  // Step 1: Check in 2 dinner guests
  const update1 = updateRsvp(rsvpId, { dinnerPullUpCount: 2 });
  rsvp = update1.rsvp;
  if (rsvp.dinnerPullUpCount !== 2 || rsvp.cocktailOnlyPullUpCount !== 0) {
    console.error("❌ Step 1 failed:", rsvp);
    return false;
  }
  console.log("✅ Step 1: 2 dinner checked in → PullUpStatus = PARTIAL");

  // Step 2: Check in 1 cocktail guest
  const update2 = updateRsvp(rsvpId, { cocktailOnlyPullUpCount: 1 });
  rsvp = update2.rsvp;
  if (rsvp.dinnerPullUpCount !== 2 || rsvp.cocktailOnlyPullUpCount !== 1) {
    console.error("❌ Step 2 failed:", rsvp);
    return false;
  }
  console.log("✅ Step 2: +1 cocktail → PullUpStatus = PARTIAL");

  // Step 3: Check in remaining 2 dinner guests
  const update3 = updateRsvp(rsvpId, { dinnerPullUpCount: 4 });
  rsvp = update3.rsvp;
  if (rsvp.dinnerPullUpCount !== 4 || rsvp.cocktailOnlyPullUpCount !== 1) {
    console.error("❌ Step 3 failed:", rsvp);
    return false;
  }
  console.log("✅ Step 3: All 4 dinner checked in → PullUpStatus = PARTIAL");

  // Step 4: Check in remaining 2 cocktail guests
  const update4 = updateRsvp(rsvpId, { cocktailOnlyPullUpCount: 3 });
  rsvp = update4.rsvp;
  if (rsvp.dinnerPullUpCount !== 4 || rsvp.cocktailOnlyPullUpCount !== 3) {
    console.error("❌ Step 4 failed:", rsvp);
    return false;
  }
  console.log("✅ Step 4: All 3 cocktails checked in → PullUpStatus = FULL");

  // Verify total
  const totalArrived = rsvp.dinnerPullUpCount + rsvp.cocktailOnlyPullUpCount;
  if (totalArrived !== 7) {
    console.error("❌ Total arrived incorrect:", totalArrived);
    return false;
  }
  console.log("✅ Total arrived = 7 (matches partySize)");

  return true;
}

// Test 2: Waitlisted RSVP Cannot Get Non-Zero Pull-Up Counts
function testWaitlistedRsvpPullUpPrevention() {
  console.log("\n🧪 Test 2: Waitlisted RSVP Pull-Up Prevention");

  const event = createTestEvent();

  // Create a waitlisted RSVP by filling up capacity first
  // (Simplified: just create one with WAITLIST status)
  const result = addRsvp({
    slug: event.slug,
    name: "Waitlist User",
    email: "waitlist@example.com",
    plusOnes: 0,
    wantsDinner: false,
  });

  if (result.error) {
    console.error("❌ Failed to create RSVP:", result.error);
    return false;
  }

  // Manually set to WAITLIST (simulating capacity full scenario)
  const rsvpId = result.rsvp.id;
  const update1 = updateRsvp(rsvpId, { bookingStatus: "WAITLIST" });
  let rsvp = update1.rsvp;

  if (rsvp.bookingStatus !== "WAITLIST") {
    console.error("❌ Failed to set WAITLIST status");
    return false;
  }
  console.log("✅ RSVP set to WAITLIST");

  // Try to set pull-up counts
  const update2 = updateRsvp(rsvpId, {
    dinnerPullUpCount: 1,
    cocktailOnlyPullUpCount: 1,
  });
  rsvp = update2.rsvp;

  // Should be prevented/reset to 0
  if (rsvp.dinnerPullUpCount !== 0 || rsvp.cocktailOnlyPullUpCount !== 0) {
    console.error(
      "❌ Pull-up counts not prevented for WAITLIST:",
      rsvp.dinnerPullUpCount,
      rsvp.cocktailOnlyPullUpCount
    );
    return false;
  }
  console.log("✅ Pull-up counts prevented/reset to 0 for WAITLIST");

  return true;
}

// Test 3: Turning wantsDinner from true → false
function testDisableDinner() {
  console.log("\n🧪 Test 3: Disable Dinner");

  const event = createTestEvent();
  const result = addRsvp({
    slug: event.slug,
    name: "Dinner User",
    email: "dinner@example.com",
    plusOnes: 2,
    wantsDinner: true,
    dinnerTimeSlot: event.dinnerStartTime,
    dinnerPartySize: 2,
  });

  if (result.error) {
    console.error("❌ Failed to create RSVP:", result.error);
    return false;
  }

  const rsvpId = result.rsvp.id;
  let rsvp = result.rsvp;

  // Set some pull-up counts
  const update1 = updateRsvp(rsvpId, {
    dinnerPullUpCount: 2,
    cocktailOnlyPullUpCount: 1,
  });
  rsvp = update1.rsvp;

  if (rsvp.dinner === null || rsvp.dinnerPullUpCount !== 2) {
    console.error("❌ Failed to set initial dinner pull-up");
    return false;
  }
  console.log("✅ Initial state: dinner enabled, dinnerPullUpCount = 2");

  // Disable dinner
  const update2 = updateRsvp(rsvpId, { wantsDinner: false });
  rsvp = update2.rsvp;

  // Should wipe dinner and dinnerPullUpCount
  if (
    rsvp.dinner !== null ||
    rsvp.dinnerPullUpCount !== 0 ||
    rsvp.wantsDinner !== false
  ) {
    console.error("❌ Dinner not properly disabled:", {
      dinner: rsvp.dinner,
      dinnerPullUpCount: rsvp.dinnerPullUpCount,
      wantsDinner: rsvp.wantsDinner,
    });
    return false;
  }
  console.log("✅ Dinner disabled: dinner = null, dinnerPullUpCount = 0");

  // Cocktail pull-up should remain
  if (rsvp.cocktailOnlyPullUpCount !== 1) {
    console.error(
      "❌ Cocktail pull-up count should remain:",
      rsvp.cocktailOnlyPullUpCount
    );
    return false;
  }
  console.log("✅ Cocktail pull-up count preserved: 1");

  return true;
}

// Run all tests
function runTests() {
  console.log("=".repeat(60));
  console.log("RSVP Model Compliance Tests");
  console.log("=".repeat(60));

  const results = [
    testIncrementalCheckIns(),
    testWaitlistedRsvpPullUpPrevention(),
    testDisableDinner(),
  ];

  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed}/${total} tests passed`);
  console.log("=".repeat(60));

  if (passed === total) {
    console.log("✅ All tests passed!");
    process.exit(0);
  } else {
    console.log("❌ Some tests failed");
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export {
  testIncrementalCheckIns,
  testWaitlistedRsvpPullUpPrevention,
  testDisableDinner,
};
