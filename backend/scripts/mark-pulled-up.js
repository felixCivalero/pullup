// Script to mark all RSVPs for "Kaijas Musiksalong" as pulled up
// Usage: NODE_ENV=development node backend/scripts/mark-pulled-up.js

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

// Set development mode before loading env
process.env.NODE_ENV = process.env.NODE_ENV || "development";

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend/.env.development
const envFile = join(__dirname, "..", ".env.development");
dotenv.config({ path: envFile });

// Now import supabase (which will also try to load env, but we've already loaded it)
import { supabase } from "../src/supabase.js";

async function markPulledUpForEvent() {
  const eventTitle = "Kaijas Musiksalong";

  console.log(`🔍 Looking for event: "${eventTitle}"`);

  // Find the event by title
  const { data: events, error: eventError } = await supabase
    .from("events")
    .select("id, title, slug")
    .ilike("title", `%${eventTitle}%`);

  if (eventError) {
    console.error("❌ Error finding event:", eventError);
    process.exit(1);
  }

  if (!events || events.length === 0) {
    console.error(`❌ Event "${eventTitle}" not found`);
    process.exit(1);
  }

  if (events.length > 1) {
    console.warn(`⚠️  Found ${events.length} events matching "${eventTitle}":`);
    events.forEach((e) => console.log(`   - ${e.title} (${e.id})`));
    console.log("Using the first match...");
  }

  const event = events[0];
  console.log(`✅ Found event: "${event.title}" (${event.id})`);

  // Get all RSVPs for this event
  console.log(`\n📋 Fetching RSVPs for event...`);
  const { data: rsvps, error: rsvpError } = await supabase
    .from("rsvps")
    .select(
      "id, person_id, party_size, dinner_party_size, plus_ones, wants_dinner, dinner, booking_status, status"
    )
    .eq("event_id", event.id);

  if (rsvpError) {
    console.error("❌ Error fetching RSVPs:", rsvpError);
    process.exit(1);
  }

  if (!rsvps || rsvps.length === 0) {
    console.log("ℹ️  No RSVPs found for this event");
    process.exit(0);
  }

  console.log(`✅ Found ${rsvps.length} RSVPs`);

  // Process each RSVP
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const rsvp of rsvps) {
    // Skip if not confirmed
    if (rsvp.booking_status !== "CONFIRMED" && rsvp.status !== "attending") {
      console.log(
        `⏭️  Skipping RSVP ${rsvp.id} - not confirmed (status: ${
          rsvp.booking_status || rsvp.status
        })`
      );
      skipped++;
      continue;
    }

    // Calculate pull-up counts
    const partySize = rsvp.party_size || 1;
    const wantsDinner = rsvp.wants_dinner || false;
    const dinnerPartySize = rsvp.dinner_party_size || 0;

    // Check dinner from JSONB field if available
    const dinner = rsvp.dinner;
    const hasDinner = wantsDinner || (dinner && dinner.enabled);
    const actualDinnerPartySize =
      dinnerPartySize || (dinner && dinner.partySize) || 0;

    let dinnerPullUpCount = 0;
    let cocktailOnlyPullUpCount = 0;

    if (hasDinner && actualDinnerPartySize > 0) {
      // They have dinner reservation
      dinnerPullUpCount = actualDinnerPartySize;
      // Cocktail-only guests are the rest of the party
      cocktailOnlyPullUpCount = Math.max(0, partySize - actualDinnerPartySize);
    } else {
      // No dinner - all guests are cocktail-only
      cocktailOnlyPullUpCount = partySize;
      dinnerPullUpCount = 0;
    }

    // Calculate backward compatibility fields
    const pulledUp = dinnerPullUpCount > 0 || cocktailOnlyPullUpCount > 0;
    const pulledUpCount = pulledUp
      ? dinnerPullUpCount + cocktailOnlyPullUpCount
      : null;
    const pulledUpForDinner = dinnerPullUpCount > 0 ? dinnerPullUpCount : null;
    const pulledUpForCocktails =
      cocktailOnlyPullUpCount > 0 ? cocktailOnlyPullUpCount : null;

    // Update the RSVP
    const { error: updateError } = await supabase
      .from("rsvps")
      .update({
        pulled_up: pulledUp,
        pulled_up_count: pulledUpCount,
        dinner_pull_up_count: dinnerPullUpCount,
        cocktail_only_pull_up_count: cocktailOnlyPullUpCount,
        pulled_up_for_dinner: pulledUpForDinner,
        pulled_up_for_cocktails: pulledUpForCocktails,
      })
      .eq("id", rsvp.id);

    if (updateError) {
      console.error(`❌ Error updating RSVP ${rsvp.id}:`, updateError.message);
      errors++;
    } else {
      console.log(
        `✅ Updated RSVP ${rsvp.id}: dinner=${dinnerPullUpCount}, cocktails=${cocktailOnlyPullUpCount}`
      );
      updated++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`\n✨ Done!`);
}

// Run the script
markPulledUpForEvent()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
