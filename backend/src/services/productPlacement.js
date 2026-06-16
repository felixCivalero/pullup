// Product placement — the read/write layer behind "where does this product show".
//
// A product is an events row kind='product'. Products are GLOBAL (a host's
// library). Placement is two-layered (see migrations/100_product_placement.sql):
//   • MAIN ROOM  — implicit: a LIVE product (status='PUBLISHED') shows unless
//     hide_from_main_room is set.
//   • EVENT ROOMS — explicit: room_products rows the host adds per event room.
//
// This module never lets a product's SECRETS (download path, secret value,
// unlock body) leave the server — public callers get the same sanitized
// `productDelivery` summary the public event route uses.

import { supabase } from "../supabase.js";

// SAFE summary of a product's delivery config — flags + the public external
// link only. The real download/secret/unlock is served post-pay by the gated
// /public/rsvps/:id/delivery route. Mirrors routes/events.js GET /events/:slug.
export function sanitizeProductDelivery(fulfillment) {
  const f = fulfillment && typeof fulfillment === "object" ? fulfillment : null;
  if (!f) return null;
  return {
    hasDownload: !!f.download?.enabled,
    secretKind: f.secret?.enabled ? (f.secret.kind || "link") : null,
    unlock: f.unlock?.enabled ? { title: f.unlock.title || "Members-only" } : null,
    external: f.external?.enabled && f.external.url ? { url: f.external.url } : null,
  };
}

// Paid units + revenue for a set of product event ids. One purchase = one
// settled RSVP (payment_status='paid' && booking_status='CONFIRMED'). Revenue is
// units × ticket price (cents) — the storefront card stat, not the ledger.
//
// A per-product HEAD count (one bounded query each) — accurate past the 1000-row
// REST cap, and a host's product library is small enough to fan out safely.
async function statsForProducts(productEvents) {
  const out = {};
  await Promise.all(
    productEvents.map(async (p) => {
      const { count, error } = await supabase
        .from("rsvps")
        .select("id", { count: "exact", head: true })
        .eq("event_id", p.id)
        .eq("payment_status", "paid")
        .eq("booking_status", "CONFIRMED");
      if (error) {
        console.error("[productPlacement] statsForProducts failed", error);
        out[p.id] = { unitsSold: 0, revenue: 0 };
        return;
      }
      const units = count || 0;
      out[p.id] = { unitsSold: units, revenue: units * (Number(p.ticket_price) || 0) };
    }),
  );
  return out;
}

// Shape a product events row into a card. forHost=true keeps management fields
// (status, hideFromMainRoom, stats); the visitor card is buy-safe only.
function toCard(dbEvent, { stats = null, forHost = false } = {}) {
  let cover = dbEvent.cover_image_url || dbEvent.image_url || null;
  if (cover && !cover.startsWith("http")) {
    const m = cover.match(/event-images\/([^?]+)/);
    const { data: pub } = supabase.storage.from("event-images").getPublicUrl(m ? m[1] : cover);
    if (pub?.publicUrl) cover = pub.publicUrl;
  }
  const card = {
    id: dbEvent.id,
    slug: dbEvent.slug,
    title: dbEvent.title || "Untitled product",
    description: dbEvent.description || null,
    coverImageUrl: cover,
    price: dbEvent.ticket_price != null ? Number(dbEvent.ticket_price) : null,
    currency: dbEvent.ticket_currency || "usd",
    live: dbEvent.status === "PUBLISHED",
    productDelivery: sanitizeProductDelivery(dbEvent.fulfillment),
  };
  if (forHost) {
    card.status = dbEvent.status || "DRAFT";
    card.hideFromMainRoom = !!dbEvent.hide_from_main_room;
    card.unitsSold = stats?.[dbEvent.id]?.unitsSold || 0;
    card.revenue = stats?.[dbEvent.id]?.revenue || 0;
  }
  return card;
}

// Every product the host owns (live + draft), newest first, with stats. Powers
// the "Your products" card on the host home + the manage picker in a room.
export async function listHostProducts(hostId) {
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, title, description, status, ticket_price, ticket_currency, cover_image_url, image_url, fulfillment, hide_from_main_room, created_at")
    .eq("host_id", hostId)
    .eq("kind", "product")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[productPlacement] listHostProducts failed", error);
    return [];
  }
  const rows = data || [];
  const stats = await statsForProducts(rows);
  return rows.map((e) => toCard(e, { stats, forHost: true }));
}

// The MAIN-room showcase: a host's LIVE products that aren't hidden, oldest
// first (stable order). forHost adds stats/manage fields.
export async function listMainRoomProducts(hostId, { forHost = false } = {}) {
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, title, description, status, ticket_price, ticket_currency, cover_image_url, image_url, fulfillment, hide_from_main_room, created_at")
    .eq("host_id", hostId)
    .eq("kind", "product")
    .eq("status", "PUBLISHED")
    .eq("hide_from_main_room", false)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[productPlacement] listMainRoomProducts failed", error);
    return [];
  }
  const rows = data || [];
  const stats = forHost ? await statsForProducts(rows) : null;
  return rows.map((e) => toCard(e, { stats, forHost }));
}

// The EVENT-room showcase: products explicitly assigned to this event's room,
// in the host's chosen order. Drafts are skipped for visitors (live only).
export async function listEventRoomProducts(eventId, { forHost = false } = {}) {
  const { data: links, error } = await supabase
    .from("room_products")
    .select("product_event_id, sort")
    .eq("event_id", eventId)
    .order("sort", { ascending: true });
  if (error) {
    console.error("[productPlacement] listEventRoomProducts links failed", error);
    return [];
  }
  const ids = (links || []).map((l) => l.product_event_id);
  if (!ids.length) return [];
  const { data: rows, error: e2 } = await supabase
    .from("events")
    .select("id, slug, title, description, status, ticket_price, ticket_currency, cover_image_url, image_url, fulfillment, hide_from_main_room")
    .in("id", ids) // safe-query: ok — ids = one room's assigned products (host-bounded, tiny)
    .eq("kind", "product");
  if (e2) {
    console.error("[productPlacement] listEventRoomProducts events failed", e2);
    return [];
  }
  const byId = {};
  for (const r of rows || []) byId[r.id] = r;
  const ordered = ids.map((id) => byId[id]).filter(Boolean);
  const visible = forHost ? ordered : ordered.filter((e) => e.status === "PUBLISHED");
  const stats = forHost ? await statsForProducts(visible) : null;
  return visible.map((e) => toCard(e, { stats, forHost }));
}

// Assign a product to an event room. Idempotent (unique event_id+product_event_id).
// New rows sort to the end. Caller guarantees the host owns both the room and the
// product, and that productEventId is actually kind='product'.
export async function assignProductToRoom({ hostId, eventId, productEventId }) {
  const { data: maxRow } = await supabase
    .from("room_products")
    .select("sort")
    .eq("event_id", eventId)
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort ?? -1) + 1;
  const { error } = await supabase
    .from("room_products")
    .upsert(
      { host_id: hostId, event_id: eventId, product_event_id: productEventId, sort: nextSort },
      { onConflict: "event_id,product_event_id", ignoreDuplicates: true },
    );
  if (error) {
    console.error("[productPlacement] assignProductToRoom failed", error);
    throw new Error("Could not add product to room");
  }
  return { ok: true };
}

export async function removeProductFromRoom({ eventId, productEventId }) {
  const { error } = await supabase
    .from("room_products")
    .delete()
    .eq("event_id", eventId)
    .eq("product_event_id", productEventId);
  if (error) {
    console.error("[productPlacement] removeProductFromRoom failed", error);
    throw new Error("Could not remove product from room");
  }
  return { ok: true };
}

// Reorder a room's products. `order` is the product_event_id list in the order
// the host wants; anything omitted keeps its prior relative position after them.
export async function reorderRoomProducts({ eventId, order }) {
  if (!Array.isArray(order) || !order.length) return { ok: true };
  await Promise.all(
    order.map((productEventId, i) =>
      supabase
        .from("room_products")
        .update({ sort: i })
        .eq("event_id", eventId)
        .eq("product_event_id", productEventId),
    ),
  );
  return { ok: true };
}

// Toggle a product's main-room visibility (the implicit-placement opt-out).
export async function setProductMainRoomHidden({ productEventId, hidden }) {
  const { error } = await supabase
    .from("events")
    .update({ hide_from_main_room: !!hidden })
    .eq("id", productEventId)
    .eq("kind", "product");
  if (error) {
    console.error("[productPlacement] setProductMainRoomHidden failed", error);
    throw new Error("Could not update product");
  }
  return { ok: true };
}
