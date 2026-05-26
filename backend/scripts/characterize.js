// Characterization runner — populates the `vectors` table from the *_vector_input views
// using the characterization brain (src/services/characterizationService.js).
//
// Usage:
//   node scripts/characterize.js rooms   [--limit N] [--force] [--dry]
//   node scripts/characterize.js persons [--limit N] [--min-events N] [--force] [--dry]
//   node scripts/characterize.js hosts   [--limit N] [--force] [--dry]
//
// Idempotent: skips a subject whose assembled input hash already matches the stored vector
// (unless --force). --dry prints the characterization without writing. Embeddings are NOT
// produced here — that's a separate, deferred step.

import dotenv from "dotenv";
dotenv.config();

import { supabase } from "../src/supabase.js";
import { characterize, assembleInput } from "../src/services/characterizationService.js";

const args = process.argv.slice(2);
const subject = args[0];
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = parseInt(opt("limit", "1000"), 10);
const MIN_EVENTS = parseInt(opt("min-events", "1"), 10);
const MIN_RSVPS = parseInt(opt("min-rsvps", "0"), 10); // rooms: only those with >= N confirmed attendees
const FORCE = flag("force");
const DRY = flag("dry");

const CONFIG = {
  rooms:   { view: "event_vector_input",  type: "room",   idKey: "event_id",  label: (r) => r.title },
  persons: { view: "person_vector_input", type: "person", idKey: "person_id", label: (r) => r.name },
  hosts:   { view: "host_vector_input",   type: "host",   idKey: "host_id",   label: (r) => r.name },
};

function evidenceCount(type, row) {
  if (type === "room") return row.real_rsvps ?? null;
  return row.n_events ?? null;
}

function derivedFrom(type, row, result) {
  const base = { evidence: result.evidence, notes: result.notes };
  if (type === "room") return { ...base, host: row.host, tags: row.admin_tags, partners: row.hostedby_partners, real_rsvps: row.real_rsvps ?? null, pulled_up: row.pulled ?? null };
  if (type === "person") return { ...base, seeded_from: "room", host_affinity: row.host_affinity, n_events: row.n_events, n_hosts: row.n_hosts, events_browsed: row.events_browsed, intent: { has_email: row.has_email, has_full_name: row.has_full_name, has_socials: row.has_socials, has_company: row.has_company, total_spend: row.total_spend } };
  if (type === "host")   return { ...base, n_events: row.n_events, n_drafts: row.n_drafts, has_brief: !!row.host_brief, mcp_tool_usage: row.mcp_tool_usage };
  return base;
}

async function loadRoomAttendance() {
  // confirmed-attendee + pulled-up counts per event, for room evidence/confidence
  const { data, error } = await supabase.from("rsvps").select("event_id, pulled_up, status").eq("status", "attending");
  if (error) throw error;
  const att = {}, pulled = {};
  for (const r of data || []) {
    att[r.event_id] = (att[r.event_id] || 0) + 1;
    if (r.pulled_up) pulled[r.event_id] = (pulled[r.event_id] || 0) + 1;
  }
  return { att, pulled };
}

async function main() {
  const cfg = CONFIG[subject];
  if (!cfg) {
    console.error(`Usage: node scripts/characterize.js <rooms|persons|hosts> [--limit N] [--min-events N] [--force] [--dry]`);
    process.exit(1);
  }

  let query = supabase.from(cfg.view).select("*");
  if (subject === "rooms") query = query.not("content_text", "is", null);
  if (subject === "persons" && MIN_EVENTS > 1) query = query.gte("n_events", MIN_EVENTS);
  const { data: rows, error } = await query;
  if (error) { console.error("view fetch failed:", error.message); process.exit(1); }

  let work = (rows || []).filter((r) => r[cfg.idKey]);

  if (subject === "rooms") {
    const attMaps = await loadRoomAttendance();
    for (const r of work) { r.real_rsvps = attMaps.att[r.event_id] ?? 0; r.pulled = attMaps.pulled[r.event_id] ?? 0; }
    if (MIN_RSVPS > 0) work = work.filter((r) => r.real_rsvps >= MIN_RSVPS);
    work.sort((a, b) => (b.real_rsvps || 0) - (a.real_rsvps || 0));
  }
  if (subject === "persons") work.sort((a, b) => (b.n_events || 0) - (a.n_events || 0));
  if (subject === "hosts") { work = work.filter((r) => (r.n_events || 0) >= 1); work.sort((a, b) => (b.n_events || 0) - (a.n_events || 0)); }
  work = work.slice(0, LIMIT);

  // existing hashes for idempotency
  const ids = work.map((r) => r[cfg.idKey]);
  const { data: existing } = await supabase.from("vectors").select("subject_id, content_hash").eq("subject_type", cfg.type).in("subject_id", ids);
  const existingHash = Object.fromEntries((existing || []).map((v) => [v.subject_id, v.content_hash]));

  console.log(`\n▸ ${subject}: ${work.length} candidates (model via service)\n`);
  let done = 0, skipped = 0, failed = 0;

  for (const row of work) {
    const id = row[cfg.idKey];
    const label = cfg.label(row) || id;

    const { contentHash } = assembleInput(cfg.type, row);
    if (!FORCE && existingHash[id] && existingHash[id] === contentHash) {
      console.log(`  ⤼ skip (unchanged): ${label}`);
      skipped++;
      continue;
    }

    try {
      const result = await characterize(cfg.type, row);
      console.log(`\n  ● ${label}  [conf ${result.confidence}]`);
      console.log(`    ${result.characterization}`);
      if (result.notes) console.log(`    notes: ${result.notes}`);

      if (!DRY) {
        const { error: upErr } = await supabase.from("vectors").upsert({
          subject_type: cfg.type,
          subject_id: id,
          subject_label: String(label).slice(0, 200),
          characterization: result.characterization,
          confidence: result.confidence,
          evidence_count: evidenceCount(cfg.type, row),
          model: result.model,
          prompt_version: result.promptVersion,
          content_hash: result.contentHash,
          derived_from: derivedFrom(cfg.type, row, result),
          updated_at: new Date().toISOString(),
        }, { onConflict: "subject_type,subject_id" });
        if (upErr) { console.error(`    ✗ upsert failed: ${upErr.message}`); failed++; continue; }
      }
      done++;
    } catch (err) {
      console.error(`    ✗ ${label}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✓ ${subject}: ${done} written, ${skipped} skipped, ${failed} failed${DRY ? " (dry run, nothing written)" : ""}\n`);
  process.exit(0);
}

main();
