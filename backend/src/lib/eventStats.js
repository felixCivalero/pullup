// Statistics for organisers: how an event page is found and how it fills, and
// the same rolled up per brand (and, for a main brand, per brand under it).
// Pure functions over rows already scoped to what the caller may see
// (repos/hostEvents.js loads them): events, rsvps, people, pullups and the
// event page visits (event_page_views, written by POST /events/:slug/view).
//
// A visit's source: its utm_source when the link carried one, else the site
// it came from, else "direct". A sign-up's source is the source of the visit
// it was made on (rsvps.visitor_id = the visit id).

const DAY = 86400000;

const HOSTS = [
  ["instagram", /(^|\.)instagram\.com$|^l\.instagram\.com$|^ig\.me$/],
  ["facebook", /(^|\.)facebook\.com$|^fb\.me$|^m\.facebook\.com$|^l\.facebook\.com$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["linkedin", /(^|\.)linkedin\.com$|^lnkd\.in$/],
  ["google", /(^|\.)google\.[a-z.]+$/],
  ["ai", /(^|\.)(chatgpt\.com|openai\.com|claude\.ai|perplexity\.ai|gemini\.google\.com)$/],
  ["mail", /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/],
  ["pullup", /(^|\.)pullup\.se$/],
];
const UTM = { ig: "instagram", instagram: "instagram", fb: "facebook", facebook: "facebook", meta: "facebook", tiktok: "tiktok", linkedin: "linkedin", google: "google", email: "mail", mail: "mail", mejl: "mail", newsletter: "mail", pullup: "mail", chatgpt: "ai", claude: "ai" };

export function sourceOf(view) {
  const utm = String(view?.utm_source || "").trim().toLowerCase();
  if (utm) return UTM[utm] || utm.slice(0, 40);
  let host = "";
  try {
    host = new URL(view?.referrer || "").hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "direct";
  }
  if (!host) return "direct";
  for (const [name, re] of HOSTS) if (re.test(host)) return name;
  return host.slice(0, 60);
}

const day = (iso) => new Date(iso).toISOString().slice(0, 10);
const live = (r) => r.status !== "cancelled";

function countBy(list, key) {
  const out = new Map();
  for (const x of list) out.set(key(x), (out.get(key(x)) || 0) + 1);
  return [...out].map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n);
}

// Every day from `from` to `to` (inclusive), each with its visits and sign-ups.
function series(views, signups, from, to) {
  const days = new Map();
  for (let t = Date.parse(day(from)); t <= Date.parse(day(to)); t += DAY) days.set(day(new Date(t).toISOString()), { day: day(new Date(t).toISOString()), visits: 0, signups: 0 });
  for (const v of views) days.get(day(v.created_at)) && (days.get(day(v.created_at)).visits += 1);
  for (const r of signups) days.get(day(r.created_at)) && (days.get(day(r.created_at)).signups += 1);
  return [...days.values()];
}

// The numbers for a set of events: visits, visitors, sign-ups, who came,
// consents, and the conversion measured only over the time visits were
// counted (sign-ups from before can't be compared with visits we never saw).
export function totalsFor({ events, rsvps, views, pullups = [] }) {
  const ids = new Set(events.map((e) => e.id));
  const vs = views.filter((v) => ids.has(v.event_id));
  const rs = rsvps.filter((r) => ids.has(r.event_id) && live(r));
  const came = new Set(pullups.filter((p) => ids.has(p.event_id)).map((p) => `${p.event_id}:${p.person_id}`));
  const firstView = new Map();
  for (const v of vs) if (!firstView.has(v.event_id) || v.created_at < firstView.get(v.event_id)) firstView.set(v.event_id, v.created_at);
  const visitors = new Set(vs.map((v) => `${v.event_id}:${v.visitor_id || v.id}`)).size;
  const measured = rs.filter((r) => firstView.has(r.event_id) && r.created_at >= firstView.get(r.event_id)).length;
  return {
    events: events.length,
    visits: vs.length,
    visitors,
    signups: rs.length,
    attending: rs.filter((r) => r.status === "attending").length,
    waitlist: rs.filter((r) => r.status === "waitlist").length,
    came: rs.filter((r) => r.pulled_up || came.has(`${r.event_id}:${r.person_id}`)).length,
    consents: rs.filter((r) => r.marketing_opt_in).length,
    conversion: visitors ? Math.min(1, measured / visitors) : null,
  };
}

// One event's story: the totals, where its visits and its sign-ups came
// from, devices, new vs returning guests, and day by day.
export function eventStats({ event, events, rsvps, views, pullups = [], now = Date.now() }) {
  const vs = views.filter((v) => v.event_id === event.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const rs = rsvps.filter((r) => r.event_id === event.id && live(r));
  const srcByVisit = new Map();
  for (const v of vs) if (v.visitor_id && !srcByVisit.has(v.visitor_id)) srcByVisit.set(v.visitor_id, sourceOf(v));
  // Returning: signed up to one of the brand's events that started before this one.
  const before = new Set(events.filter((e) => e.id !== event.id && e.starts_at && event.starts_at && e.starts_at < event.starts_at).map((e) => e.id));
  const earlier = new Set(rsvps.filter((r) => before.has(r.event_id) && live(r)).map((r) => r.person_id));
  const first = [vs[0]?.created_at, rs[0]?.created_at, event.created_at].filter(Boolean).sort()[0] || new Date(now).toISOString();
  const end = Math.min(now, Date.parse(event.ends_at || event.starts_at || new Date(now).toISOString()) + 3 * DAY);
  const from = new Date(Math.max(Date.parse(first), end - 89 * DAY)).toISOString();
  return {
    totals: totalsFor({ events: [event], rsvps, views, pullups }),
    sources: countBy(vs, sourceOf),
    signupSources: countBy(rs, (r) => srcByVisit.get(r.visitor_id) || "unknown"),
    devices: countBy(vs, (v) => v.device_type || "unknown"),
    returning: rs.filter((r) => earlier.has(r.person_id)).length,
    daily: series(vs, rs, from, new Date(Math.max(end, Date.parse(from))).toISOString()),
    countedSince: vs[0]?.created_at || null,
  };
}

// A brand's (or a main brand's) overview: totals, one row per brand when
// there are several, one per event, and the last 60 days.
export function brandStats({ brands, events, rsvps, views, pullups = [], now = Date.now() }) {
  const rows = events.map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, brandId: e.brand_id || null, status: e.status, ...totalsFor({ events: [e], rsvps, views, pullups }) }));
  const ids = new Set(events.map((e) => e.id));
  const recentFrom = new Date(now - 59 * DAY).toISOString();
  const vs = views.filter((v) => ids.has(v.event_id) && v.created_at >= recentFrom);
  const rs = rsvps.filter((r) => ids.has(r.event_id) && live(r) && r.created_at >= recentFrom);
  return {
    totals: totalsFor({ events, rsvps, views, pullups }),
    brands: brands.length > 1
      ? brands.map((b) => ({ id: b.id, name: b.name, ...totalsFor({ events: events.filter((e) => e.brand_id === b.id), rsvps, views, pullups }) }))
      : [],
    events: rows.sort((a, b) => (b.startsAt || "").localeCompare(a.startsAt || "")),
    sources: countBy(views.filter((v) => ids.has(v.event_id)), sourceOf).slice(0, 8),
    daily: series(vs, rs, recentFrom, new Date(now).toISOString()),
  };
}
