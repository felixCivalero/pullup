// Public, PII-free map of where PullUp rooms have actually happened.
//
// The admin globe (/admin/events-map) hands over every located event with host
// names + coming counts — that's admin-only. The public landing page needs the
// same picture with NONE of the identifying data: just the cities, their
// centroid coordinates, and a weight (how many rooms / how many people pulled
// up there) so the marketing globe can glow brighter where more happened.
//
// GET /api/pullup-cities → { cities: [{ city, country, lat, lng, events, people }] }
// Cached in-memory for a few minutes — the data moves slowly and this endpoint
// is public, so it must not fan a request into a fresh DB scan every hit.

import { supabase } from "../supabase.js";
import { selectAllPaged } from "../db/safeQuery.js";

// Location strings are Google-shaped: "Venue, Street 12, 116 45 Stockholm,
// Sverige". The CITY is the last segment that isn't a country, with any
// postal-code prefix stripped — mirrors AdminGlobe.cityOf on the frontend so
// the two surfaces agree on how a location resolves to a city.
const COUNTRIES = new Set([
  "sverige", "sweden", "norge", "norway", "danmark", "denmark", "finland", "suomi",
  "kenya", "germany", "deutschland", "tyskland", "spain", "españa", "espana", "spanien",
  "france", "frankrike", "italy", "italia", "italien", "uk", "united kingdom", "england",
  "usa", "united states", "netherlands", "nederland", "nederländerna", "belgium", "belgien",
  "portugal", "poland", "polen", "estonia", "estland", "iceland", "island", "schweiz",
  "switzerland", "austria", "österrike", "greece", "grekland",
]);
function cityOf(location) {
  const parts = String(location || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (COUNTRIES.has(parts[i].toLowerCase())) continue;
    const city = parts[i].replace(/^[\d\s-]+/, "").trim(); // "116 45 Stockholm" → "Stockholm"
    if (city) return city;
  }
  return parts[parts.length - 1] || "";
}
function countryOf(location) {
  const parts = String(location || "").split(",").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return COUNTRIES.has(last.toLowerCase()) ? last : "";
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, payload: null };

async function computeCities() {
  // Located, real (non-draft) events only — the world where rooms have actually
  // been scheduled or happened.
  const { data: rows, error } = await supabase
    .from("events")
    .select("id, location, location_lat, location_lng, status, kind")
    .not("location_lat", "is", null)
    .limit(2000);
  if (error) throw error;

  const evs = (rows || []).filter(
    (e) =>
      (e.kind == null || e.kind === "event") &&
      String(e.status || "").toUpperCase() !== "DRAFT",
  );
  if (!evs.length) return { cities: [] };

  // Attendance per event = pull-up signal (rsvps.pulled_up OR pullups table),
  // de-duped to the larger of the two so a person counted on both rails isn't
  // double-counted into the dot size. Only aggregate weight leaves the server.
  // Both signal tables are small platform-wide, so we page the whole set and
  // filter to our event ids in memory — no per-chunk `.in()` truncation risk.
  const idSet = new Set(evs.map((e) => e.id));
  const pulledByEvent = new Map();
  const bump = (id, n) => {
    if (!n) return;
    pulledByEvent.set(id, Math.max(pulledByEvent.get(id) || 0, n));
  };
  const countInto = (rows, out) => {
    for (const r of rows || []) {
      if (!idSet.has(r.event_id)) continue;
      out.set(r.event_id, (out.get(r.event_id) || 0) + 1);
    }
  };
  try {
    const rs = await selectAllPaged(() =>
      supabase.from("rsvps").select("event_id").eq("pulled_up", true),
    );
    const c = new Map();
    countInto(rs, c);
    for (const [id, n] of c) bump(id, n);
  } catch (e) {
    console.error("[pullup-cities] rsvp pulled scan failed:", e?.message);
  }
  try {
    const ps = await selectAllPaged(() => supabase.from("pullups").select("event_id"));
    const c = new Map();
    countInto(ps, c);
    for (const [id, n] of c) bump(id, n);
  } catch (e) {
    console.error("[pullup-cities] pullups scan failed:", e?.message);
  }

  // One glowing dot per real place. Geocoders write the same city with
  // inconsistent region/country strings ("Stockholm" / "Stockholm County" /
  // "Stockholms län"), so grouping by the string fragments one city into four
  // dots stacked on top of each other. Cluster by PROXIMITY instead: greedily
  // merge any room within ~25 km of an existing cluster. Each cluster keeps the
  // city/country label of its heaviest member and a people-weighted centroid.
  const CLUSTER_KM = 25;
  const km = (aLat, aLng, bLat, bLng) => {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  };

  // Heaviest rooms first so a cluster anchors on its busiest venue.
  const items = evs
    .map((e) => ({
      lat: Number(e.location_lat),
      lng: Number(e.location_lng),
      city: cityOf(e.location) || "",
      country: countryOf(e.location) || "",
      people: pulledByEvent.get(e.id) || 0,
    }))
    .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng))
    .sort((a, b) => b.people - a.people);

  const clusters = [];
  for (const it of items) {
    let c = clusters.find((k) => km(k.lat, k.lng, it.lat, it.lng) <= CLUSTER_KM);
    if (!c) {
      c = { lat: it.lat, lng: it.lng, latSum: 0, lngSum: 0, events: 0, people: 0, best: it };
      clusters.push(c);
    }
    c.latSum += it.lat;
    c.lngSum += it.lng;
    c.events += 1;
    c.people += it.people;
    // Prefer the member with the most people for the label; fall back to any
    // member that actually has a named city over one that doesn't.
    if (it.people > c.best.people || (!c.best.city && it.city)) c.best = it;
  }

  const cities = clusters
    .map((c) => ({
      city: c.best.city,
      country: c.best.country,
      lat: +(c.latSum / c.events).toFixed(4),
      lng: +(c.lngSum / c.events).toFixed(4),
      events: c.events,
      people: c.people,
    }))
    .sort((a, b) => b.people - a.people || b.events - a.events);

  return { cities };
}

export function registerPublicMapRoutes(app) {
  // PUBLIC: cities where PullUp rooms have happened — aggregate only, no PII.
  app.get("/api/pullup-cities", async (req, res) => {
    try {
      const now = Date.now();
      if (!cache.payload || now - cache.at > CACHE_TTL_MS) {
        cache = { at: now, payload: await computeCities() };
      }
      res.set("Cache-Control", "public, max-age=300");
      res.json(cache.payload);
    } catch (e) {
      console.error("[pullup-cities] failed:", e?.message);
      res.status(500).json({ error: "pullup_cities_failed" });
    }
  });
}
