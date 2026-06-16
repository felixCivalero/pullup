// ════════════════════════════════════════════════════════════════════════
// Adaptive auth-method resolver — pure logic, no React, no env, no I/O.
//
// There is no fixed "primary" sign-in method. The right first method depends on
// WHO is arriving: a Nairobi guest off a WhatsApp link should never be shown
// email first (they don't use it); a Western desktop visitor should get Google.
// This ranks the three rails per-arrival, then FILTERS to what can actually be
// delivered right now — so a region that prefers WhatsApp degrades gracefully to
// the next method while the auth template is still pending Meta approval.
//
// Kept pure so it's testable in isolation (authOrder.test.js) and reusable by
// both doors (the QR DoorVerify and the standard AuthGate) via useAuthOrder.
// ════════════════════════════════════════════════════════════════════════

export const AUTH_METHODS = ["whatsapp", "google", "email"];

// Phone-first markets: where WhatsApp is the identity rail and email is a distant
// afterthought. Representative, not exhaustive — Kenya/East Africa first, plus
// the broader WhatsApp-dominant geographies. Two parallel signals (timezone and
// phone/geo country) so we catch the arrival even when one is missing.
const PHONE_FIRST_TZ = new Set([
  "Africa/Nairobi", "Africa/Dar_es_Salaam", "Africa/Kampala", "Africa/Kigali",
  "Africa/Addis_Ababa", "Africa/Lagos", "Africa/Accra", "Africa/Johannesburg",
  "Africa/Cairo", "Asia/Kolkata", "Asia/Karachi", "Asia/Jakarta", "Asia/Dhaka",
  "America/Sao_Paulo", "America/Mexico_City", "America/Bogota", "America/Lima",
  "America/Argentina/Buenos_Aires",
]);
const PHONE_FIRST_COUNTRIES = new Set([
  "KE", "TZ", "UG", "RW", "ET", "NG", "GH", "ZA", "EG",
  "IN", "PK", "ID", "BD", "BR", "MX", "CO", "PE", "AR",
]);

// The channels that arrive ALREADY carrying a phone-shaped identity. Email and
// IG don't hand us a number, so they fall through to the regional read.
const PHONE_FIRST_CHANNELS = new Set(["whatsapp"]);

function isPhoneFirst({ arrivalChannel, timezone, country }) {
  if (arrivalChannel && PHONE_FIRST_CHANNELS.has(arrivalChannel)) return true;
  if (timezone && PHONE_FIRST_TZ.has(timezone)) return true;
  if (country && PHONE_FIRST_COUNTRIES.has(String(country).toUpperCase())) return true;
  return false;
}

// Resolve the ordered, deliverability-filtered method list for an arrival.
//   ctx.arrivalChannel  "whatsapp" | "instagram" | "email" | "web" | null
//   ctx.timezone        IANA tz, e.g. "Africa/Nairobi"
//   ctx.country         ISO-3166 alpha-2 from phone/geo, e.g. "KE"
//   ctx.knownRails      rails we already hold for this person, e.g. ["whatsapp"]
//   ctx.capabilities    { whatsapp, google, email } — what's deliverable now
// Returns { order: string[], primary: string|null }.
export function resolveAuthOrder(ctx = {}) {
  const { arrivalChannel = null, knownRails = [] } = ctx;
  // Default to today's reality: Google + email are live, WhatsApp is off until
  // its template is approved. A caller that knows better passes capabilities.
  const caps = { whatsapp: false, google: true, email: true, ...(ctx.capabilities || {}) };

  // Base preference from the strongest available signal.
  let base;
  if (arrivalChannel === "email") {
    base = ["email", "google", "whatsapp"];
  } else if (isPhoneFirst(ctx)) {
    base = ["whatsapp", "google", "email"];      // email demoted to last
  } else {
    base = ["google", "email", "whatsapp"];
  }

  // A rail we can already reach this person on beats the regional default —
  // promote it to the front, preserving the order they were given in.
  const promoted = knownRails.filter((m) => AUTH_METHODS.includes(m));
  let order = [...promoted, ...base.filter((m) => !promoted.includes(m))];

  // Filter to what can actually be delivered — never offer a method that will
  // hard-fail. This is what makes a WhatsApp-first arrival degrade cleanly while
  // the template is still pending.
  order = order.filter((m) => caps[m]);

  return { order, primary: order[0] || null };
}
