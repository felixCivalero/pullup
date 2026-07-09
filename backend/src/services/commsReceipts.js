// Per-guest comms receipts for the host's event guest list. Answers, for each
// person on THIS event: which automated messages actually went out to them
// (sign-up / waitlist-added / let-in / reminder / post-event) and their delivery
// state. This is the "did the automation reach them?" reassurance the host wants.
//
// Source of truth = email_outbox (the email rail — the floor every send lands on;
// WhatsApp-only delivery isn't reflected yet, and in prod nothing ships on WA
// until Meta approves the templates, so the email row is the honest record).
//
// Event scoping:
//   • Forward sends carry campaign_tag "comms:<type>:<eventId>" (see
//     commsCampaignTag) — exact, unambiguous.
//   • Historical reminder/post-event rows predate the tag but their
//     idempotency_key embeds the eventId ("reminder-24h-<event>-<person>",
//     "post-event-<event>-<person>"), so we can still attribute them.
//   • Historical sign-up / waitlist rows carry no event marker → not shown
//     (going-forward tagging fixes this; we never guess by subject).
import { supabase } from "../supabase.js";
import { selectInChunks } from "../db/safeQuery.js";
import { parseCommsCampaignTag, COMMS_TYPES } from "./eventComms.js";

// Best-status precedence so one queued + one delivered row collapses to delivered.
const STATUS_RANK = { delivered: 4, sent: 3, queued: 2, failed: 1, bounced: 1 };
const isOk = (s) => s === "delivered" || s === "sent";

function classifyRow(row, eventId) {
  const tag = parseCommsCampaignTag(row.campaign_tag);
  if (tag && tag.eventId === eventId && COMMS_TYPES.includes(tag.type)) return tag.type;
  const key = typeof row.idempotency_key === "string" ? row.idempotency_key : "";
  if (key.startsWith(`reminder-24h-${eventId}-`)) return "reminder";
  if (key.startsWith(`post-event-${eventId}-`)) return "postEvent";
  return null;
}

// → { [personId]: { [type]: { status, at, ok } } }. Empty object if no personIds.
export async function getCommsReceiptsForEvent(eventId, personIds) {
  const ids = [...new Set((personIds || []).filter(Boolean))];
  if (!eventId || ids.length === 0) return {};

  // Scope to THIS event's comms rows in the query itself — both to keep the
  // row count well under the 1000 cap per chunk (a person can have many outbox
  // rows across events) and to avoid pulling unrelated mail. `.or()` filter
  // strings use `*` as the wildcard (PostgREST translates it to SQL `%`). The
  // JS classifier below re-validates every row, so this filter only needs to be
  // a superset — it never has to be exact.
  const orFilter = [
    `campaign_tag.like.comms:*:${eventId}`,
    `idempotency_key.like.reminder-24h-${eventId}-*`,
    `idempotency_key.like.post-event-${eventId}-*`,
  ].join(",");
  const rows = await selectInChunks(
    () => supabase
      .from("email_outbox")
      .select("person_id, campaign_tag, idempotency_key, status, created_at")
      .or(orFilter),
    "person_id",
    ids
  );

  const out = {};
  for (const row of rows) {
    const type = classifyRow(row, eventId);
    if (!type) continue;
    const pid = row.person_id;
    if (!pid) continue;
    const status = row.status || "queued";
    const bucket = (out[pid] ||= {});
    const prev = bucket[type];
    const better = !prev || (STATUS_RANK[status] || 0) > (STATUS_RANK[prev.status] || 0);
    // Keep the strongest status; track the latest timestamp seen for that type.
    const at = prev?.at && prev.at > (row.created_at || "") ? prev.at : (row.created_at || null);
    if (better) bucket[type] = { status, at, ok: isOk(status) };
    else if (prev) prev.at = at;
  }
  return out;
}
