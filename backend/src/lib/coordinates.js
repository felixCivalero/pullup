// Coordinate formatting + parsing — the backend twin of the frontend helpers in
// frontend/src/lib/urlUtils.js. Kept tiny and dependency-free so the email
// templates and OG builder render a lat/lng pair IDENTICALLY to the event page.
// That sameness is the whole point of the "show coordinates" mode: pick coords
// once and the entire system speaks coordinates the same way.

/**
 * Format a lat/lng pair as a compact, human-readable string.
 * Rounds to 6 decimals (≈11 cm) and strips trailing zeros, so
 * "59.329300, 18.068600" reads as "59.3293, 18.0686". Returns "" for
 * anything non-numeric so callers can fall through to plain text.
 * @param {number|string|null} lat
 * @param {number|string|null} lng
 * @returns {string}
 */
export function formatCoordinates(lat, lng) {
  if (lat == null || lng == null) return "";
  const round = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return parseFloat(n.toFixed(6)).toString();
  };
  const a = round(lat);
  const b = round(lng);
  if (a == null || b == null) return "";
  return `${a}, ${b}`;
}

/**
 * Parse a free-text coordinate string into { lat, lng }, or null if invalid.
 * Handles "59.3293, 18.0686", "59.3293 18.0686", "59.3293; 18.0686",
 * "59.3293° N, 18.0686° E" and "59.3293N 18.0686E". Hemisphere letters set the
 * sign and which value is the latitude. Out-of-range pairs return null.
 * @param {string} input
 * @returns {{lat:number,lng:number}|null}
 */
export function parseCoordinates(input) {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  const m = s.match(
    /^(-?\d+(?:\.\d+)?)\s*°?\s*([nsewNSEW])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([nsewNSEW])?$/
  );
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  const axisOf = (val, letter) => {
    const l = (letter || "").toLowerCase();
    if (l === "n") return { axis: "lat", v: Math.abs(val) };
    if (l === "s") return { axis: "lat", v: -Math.abs(val) };
    if (l === "e") return { axis: "lng", v: Math.abs(val) };
    if (l === "w") return { axis: "lng", v: -Math.abs(val) };
    return null;
  };

  let lat;
  let lng;
  const ra = axisOf(a, m[2]);
  const rb = axisOf(b, m[4]);
  if (ra && rb && ra.axis !== rb.axis) {
    lat = ra.axis === "lat" ? ra.v : rb.v;
    lng = ra.axis === "lng" ? ra.v : rb.v;
  } else {
    lat = a;
    lng = b;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
