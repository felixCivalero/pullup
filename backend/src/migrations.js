// backend/src/migrations.js
// Migration utilities for handling existing data

import { supabase } from "./supabase.js";

/**
 * Assign orphaned events (host_id = null) to a user
 * This should be called when a user first logs in, or manually by admin
 */
export async function assignOrphanedEventsToUser(userId) {
  const { data, error } = await supabase
    .from("events")
    .update({ host_id: userId })
    .is("host_id", null)
    .select();

  if (error) {
    console.error("Error assigning orphaned events:", error);
    throw error;
  }

  return data;
}

/**
 * Delete orphaned events (host_id = null)
 * Use this if you want to clean up test data
 */
export async function deleteOrphanedEvents() {
  const { data, error } = await supabase
    .from("events")
    .delete()
    .is("host_id", null)
    .select();

  if (error) {
    console.error("Error deleting orphaned events:", error);
    throw error;
  }

  return data;
}
