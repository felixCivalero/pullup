// Addresses for event pages (Google Places, the key stays on the server):
// suggestions while the organiser types, the chosen place's address and
// coordinates, and a map image in PullUp's grey, with a pink pin. A typed
// session token ties one search's calls together (Google bills it as one).
import { requireUser } from "../middleware/requireUser.js";
import { over } from "../lib/abuse.js";

const KEY = () => process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const session = (v) => (/^[0-9a-f-]{8,64}$/i.test(String(v || "")) ? String(v) : undefined);

// Free text → up to five places, biased to Sweden.
export async function suggestPlaces(q, sessionToken) {
  const input = clip(q, 200);
  if (input.length < 2 || !KEY()) return [];
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY() },
    body: JSON.stringify({ input, languageCode: "sv", regionCode: "se", sessionToken: session(sessionToken) }),
    signal: AbortSignal.timeout(6000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error?.message || `places ${res.status}`);
  return (out.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .slice(0, 5)
    .map((p) => ({ placeId: p.placeId, main: p.structuredFormat?.mainText?.text || p.text?.text || "", secondary: p.structuredFormat?.secondaryText?.text || "" }));
}

// One place: its name, address and coordinates. `label` is what goes on the
// event: "Name, street, city" for a venue, the address for an address.
export async function placeDetails(placeId, sessionToken) {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(String(placeId || "")) || !KEY()) return null;
  const qs = new URLSearchParams({ languageCode: "sv", regionCode: "se" });
  if (session(sessionToken)) qs.set("sessionToken", session(sessionToken));
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?${qs}`, {
    headers: { "X-Goog-Api-Key": KEY(), "X-Goog-FieldMask": "id,displayName,formattedAddress,shortFormattedAddress,location,types" },
    signal: AbortSignal.timeout(6000),
  });
  const p = await res.json().catch(() => ({}));
  if (!res.ok || !p.location) return null;
  const address = (p.formattedAddress || "").replace(/, Sverige$/, "");
  const name = p.displayName?.text || "";
  const venue = name && !address.toLowerCase().startsWith(name.toLowerCase()) && !(p.types || []).includes("street_address") && !(p.types || []).includes("premise");
  return { placeId: p.id, name, address, label: venue ? `${name}, ${address}` : address, lat: p.location.latitude, lng: p.location.longitude };
}

// An address typed without picking (an assistant's create_event): its best
// match's coordinates, or null.
export async function geocode(address) {
  const a = clip(address, 300);
  if (a.length < 3 || !KEY()) return null;
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(a)}&region=se&language=sv&key=${KEY()}`, { signal: AbortSignal.timeout(6000) });
    const g = await res.json();
    const r = g.results?.[0];
    return r ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng, placeId: r.place_id } : null;
  } catch {
    return null;
  }
}

// The map: PullUp's warm grey, white streets, quiet labels, a pink pin.
const STYLE = [
  "feature:all|saturation:-100",
  "feature:landscape|color:0xefeee9",
  "feature:water|color:0xd6d5d0",
  "feature:road|element:geometry.fill|color:0xffffff",
  "feature:road|element:geometry.stroke|color:0xd9d8d3",
  "feature:poi|visibility:off",
  "feature:transit|visibility:simplified",
  "element:labels.text.fill|color:0x6f6e69",
  "element:labels.text.stroke|color:0xefeee9",
  "feature:administrative|element:geometry.stroke|color:0xc9c8c3",
];
const maps = new Map(); // key → { png, at }

export function registerPlaceRoutes(app) {
  app.get("/admin/places", requireUser, async (req, res) => {
    try {
      if (over(`places:${req.caller.userId}`, 400, 3600000)) return res.status(429).json({ error: "rate_limited" });
      return res.json({ places: await suggestPlaces(req.query.q, req.query.session) });
    } catch (err) {
      console.error("[places] suggest:", err?.message);
      return res.json({ places: [] });
    }
  });

  app.get("/admin/places/:id", requireUser, async (req, res) => {
    try {
      const place = await placeDetails(req.params.id, req.query.session);
      return place ? res.json({ place }) : res.status(404).json({ error: "not_found" });
    } catch (err) {
      console.error("[places] details:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // An image (an <img> can't send a session), so it's public: coordinates
  // rounded, sizes fixed, cached here and in the browser, throttled per IP.
  app.get("/places/map.png", async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180 || !KEY()) return res.status(400).end();
    const zoom = Math.min(17, Math.max(11, Number(req.query.z) || 15));
    const wide = req.query.s === "wide";
    const key = `${lat.toFixed(5)},${lng.toFixed(5)},${zoom},${wide}`;
    try {
      let hit = maps.get(key);
      if (!hit) {
        if (over(`map:${req.ip}`, 150, 3600000)) return res.status(429).end();
        const qs = new URLSearchParams({ center: `${lat.toFixed(5)},${lng.toFixed(5)}`, zoom: String(zoom), size: wide ? "640x260" : "560x300", scale: "2", key: KEY() });
        for (const s of STYLE) qs.append("style", s);
        qs.append("markers", `color:0xec178f|${lat.toFixed(5)},${lng.toFixed(5)}`);
        const r = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${qs}`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return res.status(502).end();
        hit = { png: Buffer.from(await r.arrayBuffer()) };
        if (maps.size > 500) maps.clear();
        maps.set(key, hit);
      }
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=604800, immutable");
      return res.send(hit.png);
    } catch (err) {
      console.error("[places] map:", err?.message);
      return res.status(502).end();
    }
  });
}
