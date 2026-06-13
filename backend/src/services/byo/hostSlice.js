// backend/src/services/byo/hostSlice.js
//
// THE host's relational slice — the exact set of rows that constitute "a
// creator's world" and travel to their own database. Factored out of the
// export route so the export download AND the live mirror assemble the SAME
// slice from one definition (they can never drift).
//
// What's here is the relationship graph: their events + the people those events
// touched + the per-person timeline, notes, room feed, channels and door scans.
// What's deliberately NOT here is PullUp's central machinery (auth, billing,
// analytics, cross-creator identity, comms rails) — that stays in the shared DB
// by design ("your Supabase holds the people; ours holds the math").
//
// Redacted: central-operational secrets that live ON a people row but aren't
// the creator's relational data (unsubscribe token, Stripe customer id).

import { supabase } from "../../supabase.js";

export const PEOPLE_REDACT = ["marketing_unsubscribe_token", "stripe_customer_id"];

// FK-safe order for writing the slice into a fresh project: parents first.
// people → events → event_channels → rsvps → pullups → event_space_messages →
// person_events → person_notes. (Each later table references only earlier ones
// plus people.)
export const MIRROR_TABLES = [
  "people",
  "events",
  "event_channels",
  "rsvps",
  "pullups",
  "event_space_messages",
  "person_events",
  "person_notes",
];

// PostgREST caps a select at 1000 rows — page until drained.
async function fetchAll(query) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

function chunk(arr, n = 100) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Assemble the complete slice for a host. Returns rows keyed by table name
// (the MIRROR_TABLES keys) plus the host's own profile (for the export
// download; the mirror skips profile — identity stays central).
export async function gatherHostSlice(hostId) {
  const { data: profile, error: profErr } = await supabase
    .from("profiles").select("*").eq("id", hostId).maybeSingle();
  if (profErr) throw profErr;

  const events = await fetchAll(() =>
    supabase.from("events").select("*").eq("host_id", hostId).order("created_at"));
  const eventIds = events.map((e) => e.id);

  const rsvps = [], event_space_messages = [], pullups = [], event_channels = [];
  for (const ids of chunk(eventIds)) {
    rsvps.push(...await fetchAll(() =>
      supabase.from("rsvps").select("*").in("event_id", ids).order("created_at")));
    event_space_messages.push(...await fetchAll(() =>
      supabase.from("event_space_messages").select("*").in("event_id", ids).order("created_at")));
    pullups.push(...await fetchAll(() =>
      supabase.from("pullups").select("*").in("event_id", ids).order("created_at")));
    event_channels.push(...await fetchAll(() =>
      supabase.from("event_channels").select("*").in("event_id", ids).order("created_at")));
  }

  const person_events = await fetchAll(() =>
    supabase.from("person_events").select("*").eq("host_id", hostId).order("occurred_at"));
  const person_notes = await fetchAll(() =>
    supabase.from("person_notes").select("*").eq("host_id", hostId).order("created_at"));

  // Their people = everyone their events or world has touched.
  const personIds = [...new Set([
    ...rsvps.map((r) => r.person_id),
    ...person_events.map((t) => t.person_id),
    ...person_notes.map((n) => n.person_id),
    ...pullups.map((p) => p.person_id),
  ].filter(Boolean))];

  const people = [];
  for (const ids of chunk(personIds)) {
    people.push(...await fetchAll(() =>
      supabase.from("people").select("*").in("id", ids).order("created_at")));
  }
  for (const p of people) for (const k of PEOPLE_REDACT) delete p[k];

  return {
    profile,
    tables: {
      people,
      events,
      event_channels,
      rsvps,
      pullups,
      event_space_messages,
      person_events,
      person_notes,
    },
  };
}

export function sliceCounts(slice) {
  const c = {};
  for (const t of MIRROR_TABLES) c[t] = slice.tables[t]?.length || 0;
  return c;
}
