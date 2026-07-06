// backend/src/repos/systemPerson.js
//
// "PullUp" as a person — the ONE global contact that represents the platform
// in hosts' Messages (eyes avatar, Official). Threads with it are internal:
// database rows + Realtime, never email. Seeded by migration 126; this repo
// resolves + caches its id and answers "is this the system?".

import { supabase } from "../supabase.js";

export const SYSTEM_PERSON_EMAIL = "hello@pullup.se";

let _id = null;
let _at = 0;
const CACHE_MS = 5 * 60_000;

export async function getSystemPersonId() {
  if (_id && Date.now() - _at < CACHE_MS) return _id;
  const { data, error } = await supabase
    .from("people")
    .select("id")
    .eq("email", SYSTEM_PERSON_EMAIL)
    .maybeSingle();
  if (error) {
    console.error("[systemPerson] lookup failed:", error.message);
    return _id; // last known (null before first success)
  }
  _id = data?.id || null;
  _at = Date.now();
  return _id;
}

export async function isSystemPerson(personId) {
  if (!personId) return false;
  const id = await getSystemPersonId();
  return !!id && id === personId;
}
