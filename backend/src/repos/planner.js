// Content timeline repo (admin → Tidslinje): cards, timelines (lanes) and the
// event marks Felix adds himself, with their snake_case<->camelCase maps.
// Everything is scoped by host_id = the owner's user id, and by client_id:
// each client has its own timeline. null = content from before clients.
import { supabase } from "../supabase.js";

const forClient = (q, clientId) => (clientId ? q.eq("client_id", clientId) : q.is("client_id", null));

// How many rows have no client: the admin offers them as "Utan kund".
export async function countUnassignedPlanner(hostId) {
  const counts = await Promise.all(["planner_cards", "planner_timelines", "planner_events"].map(async (table) => {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("host_id", hostId).is("client_id", null);
    if (error) throw error;
    return count || 0;
  }));
  return counts.reduce((a, b) => a + b, 0);
}

function mapPlannerCardFromDb(r) {
  return {
    id: r.id,
    x: r.x,
    y: r.y,
    w: r.w,
    channel: r.channel || null,
    contentType: r.content_type || "image",
    eventId: r.event_id || null,
    timelineId: r.timeline_id || null,
    timelineIds: Array.isArray(r.timeline_ids) && r.timeline_ids.length ? r.timeline_ids : r.timeline_id ? [r.timeline_id] : [],
    note: r.note || "",
    mediaUrl: r.media_url || null,
    mediaPath: r.media_path || null,
    mediaKind: r.media_kind || "placeholder",
    mediaName: r.media_name || null,
    mediaMime: r.media_mime || null,
    links: Array.isArray(r.links) ? r.links : [],
    meta: r.meta && typeof r.meta === "object" ? r.meta : {},
  };
}

function plannerCardToDb(p) {
  const d = {};
  if (p.x !== undefined) d.x = p.x;
  if (p.y !== undefined) d.y = p.y;
  if (p.w !== undefined) d.w = p.w;
  if (p.channel !== undefined) d.channel = p.channel;
  if (p.contentType !== undefined) d.content_type = p.contentType;
  if (p.eventId !== undefined) d.event_id = p.eventId;
  if (p.timelineId !== undefined) d.timeline_id = p.timelineId;
  if (p.timelineIds !== undefined) {
    const arr = Array.isArray(p.timelineIds) ? p.timelineIds : [];
    d.timeline_ids = arr;
    d.timeline_id = arr[0] || null; // keep the FK column pointing at the primary lane
  }
  if (p.note !== undefined) d.note = p.note;
  if (p.mediaUrl !== undefined) d.media_url = p.mediaUrl;
  if (p.mediaPath !== undefined) d.media_path = p.mediaPath;
  if (p.mediaKind !== undefined) d.media_kind = p.mediaKind;
  if (p.mediaName !== undefined) d.media_name = p.mediaName;
  if (p.mediaMime !== undefined) d.media_mime = p.mediaMime;
  if (p.links !== undefined) d.links = p.links;
  if (p.meta !== undefined) d.meta = p.meta && typeof p.meta === "object" ? p.meta : {};
  return d;
}

export async function getPlannerCards(hostId, clientId = null) {
  const { data, error } = await forClient(supabase
    .from("planner_cards")
    .select("*")
    .eq("host_id", hostId), clientId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[getPlannerCards] error:", error);
    return [];
  }
  return (data || []).map(mapPlannerCardFromDb);
}

export async function createPlannerCard(hostId, card, clientId = null) {
  if (!card?.id) return { error: "missing_id" };
  const row = { id: card.id, host_id: hostId, ...plannerCardToDb(card), client_id: clientId };
  const { data, error } = await supabase.from("planner_cards").insert(row).select("*").single();
  if (error) {
    console.error("[createPlannerCard] error:", error);
    return { error: "insert_failed" };
  }
  return { card: mapPlannerCardFromDb(data) };
}

export async function updatePlannerCard(id, hostId, patch) {
  const d = plannerCardToDb(patch);
  d.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("planner_cards")
    .update(d)
    .eq("id", id)
    .eq("host_id", hostId)
    .select("*")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") console.error("[updatePlannerCard] error:", error);
    return { error: "not_found" };
  }
  return { card: mapPlannerCardFromDb(data) };
}

export async function deletePlannerCard(id, hostId) {
  const { data, error } = await supabase
    .from("planner_cards")
    .delete()
    .eq("id", id)
    .eq("host_id", hostId)
    .select("media_path")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") console.error("[deletePlannerCard] error:", error);
    return { error: "not_found" };
  }
  return { ok: true, mediaPath: data.media_path || null };
}

// ─── Content Planner timelines (lanes, per-host) ──────────────────────
// Each lane = a named, coloured horizontal track at a world-y, with a filter
// describing which of the host's events it shows. Host-scoped + RLS like cards.

function mapTimelineFromDb(r) {
  return {
    id: r.id,
    name: r.name || "Timeline",
    color: r.color || "#60a5fa",
    y: r.y ?? 0,
    sort: r.sort ?? 0,
    eventFilter: r.event_filter && typeof r.event_filter === "object" ? r.event_filter : { mode: "all", eventIds: [] },
  };
}

function timelineToDb(p) {
  const d = {};
  if (p.name !== undefined) d.name = p.name;
  if (p.color !== undefined) d.color = p.color;
  if (p.y !== undefined) d.y = p.y;
  if (p.sort !== undefined) d.sort = p.sort;
  if (p.eventFilter !== undefined) d.event_filter = p.eventFilter && typeof p.eventFilter === "object" ? p.eventFilter : { mode: "all", eventIds: [] };
  return d;
}

export async function getPlannerTimelines(hostId, clientId = null) {
  const { data, error } = await forClient(supabase
    .from("planner_timelines")
    .select("*")
    .eq("host_id", hostId), clientId)
    .order("sort", { ascending: true });
  if (error) {
    console.error("[getPlannerTimelines] error:", error);
    return [];
  }
  return (data || []).map(mapTimelineFromDb);
}

export async function createPlannerTimeline(hostId, t, clientId = null) {
  const row = { host_id: hostId, ...timelineToDb(t), client_id: clientId };
  if (t?.id) row.id = t.id; // client may mint the id for optimistic add
  const { data, error } = await supabase.from("planner_timelines").insert(row).select("*").single();
  if (error) {
    console.error("[createPlannerTimeline] error:", error);
    return { error: "insert_failed" };
  }
  return { timeline: mapTimelineFromDb(data) };
}

export async function updatePlannerTimeline(id, hostId, patch) {
  const d = timelineToDb(patch);
  d.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("planner_timelines")
    .update(d)
    .eq("id", id)
    .eq("host_id", hostId)
    .select("*")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") console.error("[updatePlannerTimeline] error:", error);
    return { error: "not_found" };
  }
  return { timeline: mapTimelineFromDb(data) };
}

export async function deletePlannerTimeline(id, hostId) {
  // Cards on this lane fall back to the default lane (timeline_id → NULL via FK).
  const { error } = await supabase.from("planner_timelines").delete().eq("id", id).eq("host_id", hostId);
  if (error) {
    console.error("[deletePlannerTimeline] error:", error);
    return { error: "delete_failed" };
  }
  return { ok: true };
}

// ─── Timeline events (marks Felix adds himself) ───────────────────────
function mapPlannerEventFromDb(r) {
  return {
    id: r.id,
    title: r.title || "Event",
    startsAt: r.starts_at, // 'YYYY-MM-DD'
    thumb: r.image_url || null,
    note: r.note || "",
  };
}

function plannerEventToDb(p) {
  const d = {};
  if (p.title !== undefined) d.title = String(p.title || "").trim().slice(0, 200) || "Event";
  if (p.startsAt !== undefined) d.starts_at = String(p.startsAt).slice(0, 10);
  if (p.thumb !== undefined) d.image_url = p.thumb || null;
  if (p.note !== undefined) d.note = p.note || null;
  return d;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getPlannerEvents(hostId, clientId = null) {
  const { data, error } = await forClient(supabase
    .from("planner_events")
    .select("*")
    .eq("host_id", hostId), clientId)
    .order("starts_at", { ascending: true });
  if (error) {
    console.error("[getPlannerEvents] error:", error);
    return [];
  }
  return (data || []).map(mapPlannerEventFromDb);
}

export async function createPlannerEvent(hostId, ev, clientId = null) {
  const row = { host_id: hostId, ...plannerEventToDb(ev), client_id: clientId };
  if (!DATE_RE.test(row.starts_at || "")) return { error: "bad_date" };
  if (ev?.id) row.id = ev.id;
  const { data, error } = await supabase.from("planner_events").insert(row).select("*").single();
  if (error) {
    console.error("[createPlannerEvent] error:", error);
    return { error: "insert_failed" };
  }
  return { event: mapPlannerEventFromDb(data) };
}

export async function updatePlannerEvent(id, hostId, patch) {
  const d = plannerEventToDb(patch);
  if (d.starts_at !== undefined && !DATE_RE.test(d.starts_at)) return { error: "bad_date" };
  d.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("planner_events")
    .update(d)
    .eq("id", id)
    .eq("host_id", hostId)
    .select("*")
    .single();
  if (error || !data) {
    if (error && error.code !== "PGRST116") console.error("[updatePlannerEvent] error:", error);
    return { error: "not_found" };
  }
  return { event: mapPlannerEventFromDb(data) };
}

export async function deletePlannerEvent(id, hostId) {
  // Cards tagged to it keep existing (event_id → NULL via FK).
  const { error } = await supabase.from("planner_events").delete().eq("id", id).eq("host_id", hostId);
  if (error) {
    console.error("[deletePlannerEvent] error:", error);
    return { error: "delete_failed" };
  }
  return { ok: true };
}
