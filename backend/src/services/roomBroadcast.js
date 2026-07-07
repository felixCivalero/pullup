// Scalable host broadcast — the durable spine behind "send this event to your
// community". Instead of fanning out N inline sends inside one HTTP request
// (which times out for large audiences), the request only ENQUEUES: a
// room_broadcasts header + one room_broadcast_recipients row per person. A
// background drainer (registered in index.js, same pattern as event reminders)
// claims batches and delivers each via sendRoomMessage, off the request thread.
//
// Idempotency: each recipient is delivered with clientId `bc:<broadcastId>:<personId>`,
// so sendRoomMessage's own dedupe (timeline dedupe_key + email_outbox
// idempotency_key) makes a re-processed row a no-op — a crash mid-send, or the
// claim's 5-minute stuck-row recovery, never double-sends.
import { supabase } from "../supabase.js";
import { canHost } from "./billing/entitlements.js";

const CHUNK = 500; // recipient insert chunk

// Enqueue a broadcast. Returns { ok, broadcastId, accepted, byChannel } fast —
// the actual delivery happens in the drainer. personIds are the resolved
// audience (the client already filtered via useAudienceFilter); we drop the
// system PullUp person and de-dupe defensively.
export async function enqueueRoomBroadcast({ hostId, personIds, text, subject, attachments = [], eventId = null }) {
  if (!hostId) return { ok: false, error: "bad_request" };
  if (!(await canHost(hostId))) return { ok: false, error: "subscription_required" };

  const { getSystemPersonId } = await import("../repos/systemPerson.js");
  const sysId = await getSystemPersonId();
  const ids = [...new Set((Array.isArray(personIds) ? personIds : []).filter((p) => p && p !== sysId))];
  if (!ids.length) return { ok: false, error: "no_recipients" };

  const atts = Array.isArray(attachments) ? attachments.filter((a) => a && a.url).slice(0, 10) : [];

  const { data: bc, error: bcErr } = await supabase
    .from("room_broadcasts")
    .insert({ host_id: hostId, event_id: eventId, text: text || null, subject: subject || null, attachments: atts, total: ids.length })
    .select("id")
    .single();
  if (bcErr || !bc) { console.error("[broadcast] header insert failed:", bcErr?.message); return { ok: false, error: "enqueue_failed" }; }

  // Insert recipients in chunks. unique(broadcast_id, person_id) makes this
  // idempotent, so a retried enqueue of the same broadcast can't duplicate work.
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = ids.slice(i, i + CHUNK).map((pid) => ({ broadcast_id: bc.id, host_id: hostId, person_id: pid }));
    const { error } = await supabase.from("room_broadcast_recipients").insert(rows);
    if (error) console.error("[broadcast] recipient chunk insert failed:", error.message);
  }

  // Kick the drainer once, unawaited, so small sends start delivering instantly
  // instead of waiting for the next timer tick. The periodic tick is the
  // durability/resume net; this is just for perceived speed.
  drainRoomBroadcasts().catch(() => {});

  return { ok: true, broadcastId: bc.id, accepted: ids.length };
}

// Progress ledger for the polling UI + the final receipt. Tallied by a grouped
// SQL aggregate (broadcast_progress) so it stays a single round trip and never
// trips the 1000-row fetch cap on a large broadcast.
export async function getBroadcastProgress({ hostId, broadcastId }) {
  if (!hostId || !broadcastId) return null;
  const { data: bc } = await supabase
    .from("room_broadcasts")
    .select("id, host_id")
    .eq("id", broadcastId)
    .maybeSingle();
  if (!bc || bc.host_id !== hostId) return null; // ownership gate before tallying

  const { data: t, error } = await supabase.rpc("broadcast_progress", { p_id: broadcastId });
  if (error || !t) return null;
  return {
    total: t.total || 0,
    sent: t.sent || 0,
    failed: t.failed || 0,
    noEmail: t.noEmail || 0,
    pending: t.pending || 0,
    byChannel: { whatsapp: t.wa || 0, email: t.em || 0, instagram: t.ig || 0 },
    done: (t.pending || 0) === 0,
  };
}

// ── The drainer ────────────────────────────────────────────────────────────
// Guarded against overlap (the immediate kick + the timer tick can race).
let draining = false;
const BATCH = 25;          // recipients claimed per pass
const MAX_ATTEMPTS = 4;    // transient-failure retries before parking as failed
const WORKER = "api";

export async function drainRoomBroadcasts() {
  if (draining) return;
  draining = true;
  try {
    const { sendRoomMessage } = await import("./roomMessaging.js");
    // Keep pulling batches until the queue is dry (bounded per pass so one huge
    // broadcast can't starve a fresh one — the next tick resumes it).
    for (let guard = 0; guard < 200; guard++) {
      const { data: batch, error } = await supabase.rpc("claim_broadcast_recipients", { p_worker: WORKER, p_batch: BATCH });
      if (error) { console.error("[broadcast] claim failed:", error.message); break; }
      if (!batch || !batch.length) break;

      for (const row of batch) {
        try {
          const bc = await loadBroadcast(row.broadcast_id);
          if (!bc) { await mark(row.id, "failed", { last_error: "broadcast_gone" }); continue; }
          const r = await sendRoomMessage({
            hostId: row.host_id,
            personId: row.person_id,
            channel: "whatsapp", // hint — dispatch splits by reachability, email floor
            text: bc.text || "",
            subject: bc.subject || undefined,
            attachments: bc.attachments || [],
            eventId: bc.event_id || null,
            clientId: `bc:${row.broadcast_id}:${row.person_id}`, // stable → idempotent
          });
          if (r.ok) {
            await mark(row.id, "sent", { channel: r.channel || null });
          } else if (r.error === "undeliverable" || r.error === "no_email") {
            // No rail and no email floor — surface it, don't retry forever.
            await mark(row.id, "no_email", { last_error: r.error });
          } else if (r.error === "subscription_required" || r.error === "not_in_world" || r.error === "no_person" || r.error === "bad_request" || r.error === "empty") {
            await mark(row.id, "failed", { last_error: r.error }); // permanent — no point retrying
          } else {
            await retryOrFail(row, r.error || "send_error");
          }
        } catch (e) {
          await retryOrFail(row, e?.message || "exception");
        }
      }
    }
  } finally {
    draining = false;
  }
}

const _bcCache = new Map();
async function loadBroadcast(id) {
  if (_bcCache.has(id)) return _bcCache.get(id);
  const { data } = await supabase.from("room_broadcasts").select("id, host_id, event_id, text, subject, attachments").eq("id", id).maybeSingle();
  _bcCache.set(id, data || null);
  // Small TTL so a long-lived process doesn't grow unbounded.
  if (_bcCache.size > 200) _bcCache.clear();
  return data || null;
}

async function mark(id, status, extra = {}) {
  await supabase.from("room_broadcast_recipients")
    .update({ status, updated_at: new Date().toISOString(), locked_at: null, locked_by: null, ...extra })
    .eq("id", id);
}

// Transient failure: back off and requeue until MAX_ATTEMPTS, then park failed.
async function retryOrFail(row, err) {
  if ((row.attempts || 0) >= MAX_ATTEMPTS) {
    await mark(row.id, "failed", { last_error: String(err).slice(0, 300) });
    return;
  }
  const backoffSec = Math.min(60 * 2 ** ((row.attempts || 1) - 1), 900);
  await supabase.from("room_broadcast_recipients")
    .update({ status: "queued", locked_at: null, locked_by: null, last_error: String(err).slice(0, 300),
      send_after: new Date(Date.now() + backoffSec * 1000).toISOString(), updated_at: new Date().toISOString() })
    .eq("id", row.id);
}
