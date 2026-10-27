// Visits → journeys, for Statistik. Pure: analytics_events rows and the
// requests in, plain objects out, so it can be tested without a database.
//
// A visit = one session_id (a random id per page load, kept while the visitor
// moves around inside the site; nothing is stored in their browser, so a
// returning visitor is a new visit). What a visit carries:
//   - page_view      which pages, in order
//   - section_view   the first time each section came into view
//   - engagement     active reading seconds per section + scroll depth, as
//                    deltas (frontend/src/lib/engagement.js) — summed here
//   - click / copy   what they pressed or copied
//   - request_*      the "Jobba med mig" form: opened, fields touched, closed,
//                    sent. A sent request carries meta.visitId → linked.

// page_view says "landing" / "case_<slug>"; the reading events say the path.
export function pagePath(p) {
  if (!p || p === "landing") return "/";
  if (p.startsWith("case_")) return `/work/${p.slice(5)}`;
  return p;
}

const FUNNEL = [
  ["visits", "Besök"],
  ["read", "Läste vidare"], // past the first screen, or 15 s of reading
  ["offer", "Nådde boka möte"],
  ["opened", "Öppnade formuläret"],
  ["started", "Började fylla i"],
  ["sent", "Skickade"],
];

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function groupBySession(events) {
  const by = new Map();
  for (const e of events) {
    const id = e.session_id || e.visitor_id;
    if (!id) continue;
    if (!by.has(id)) by.set(id, []);
    by.get(id).push(e);
  }
  for (const list of by.values()) list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return by;
}

// Everything worth knowing about one visit, from its own events.
function summarize(id, list, requestByVisit) {
  const first = list[0];
  const pages = [];
  const reading = new Map(); // path → { active, depth, sections: Map }
  const read = (path) => {
    if (!reading.has(path)) reading.set(path, { page: path, active: 0, depth: 0, sections: new Map() });
    return reading.get(path);
  };
  const sectionsSeen = new Set();
  let maxOrder = 0;
  let opened = false, started = false, sent = false, clicks = 0;
  for (const e of list) {
    const p = e.props || {};
    switch (e.event_name) {
      case "page_view": {
        const path = pagePath(p.page);
        if (pages[pages.length - 1] !== path) pages.push(path);
        read(path);
        break;
      }
      case "section_view":
        sectionsSeen.add(`${p.page || "/"}#${p.section}`);
        if ((p.page || "/") === "/") maxOrder = Math.max(maxOrder, Number(p.order) || 0);
        break;
      case "engagement": {
        const r = read(p.page || "/");
        r.active += Number(p.active) || 0;
        r.depth = Math.max(r.depth, Number(p.depth) || 0);
        for (const [s, secs] of Object.entries(p.s || {})) r.sections.set(s, (r.sections.get(s) || 0) + (Number(secs) || 0));
        break;
      }
      case "click": clicks += 1; break;
      case "request_open": opened = true; break;
      case "request_field": started = true; break;
      case "request_sent": sent = true; break;
      default: break;
    }
  }
  const pagesRead = [...reading.values()].map((r) => ({
    page: r.page,
    active: r.active,
    depth: r.depth,
    sections: [...r.sections].map(([section, secs]) => ({ section, secs })).sort((a, b) => b.secs - a.secs),
  }));
  const active = pagesRead.reduce((t, r) => t + r.active, 0);
  const home = pagesRead.find((r) => r.page === "/");
  const request = requestByVisit.get(id) || null;
  return {
    id,
    start: first.occurred_at,
    end: list[list.length - 1].occurred_at,
    source: first.source || "direct",
    device: first.device_type || null,
    pages,
    active,
    depth: home ? home.depth : Math.max(0, ...pagesRead.map((r) => r.depth)),
    sections: sectionsSeen.size,
    clicks,
    read: maxOrder >= 2 || active >= 15,
    offer: sectionsSeen.has("/#offer"),
    opened,
    started,
    sent: sent || !!request,
    request: request ? { id: request.id, name: request.name, company: request.company || null } : null,
    reading: pagesRead,
  };
}

// The list, the funnel and where time goes, for a period.
export function summarizeVisits({ events, requests = [] }) {
  const requestByVisit = new Map();
  for (const r of requests) {
    const v = r.meta?.visitId;
    if (v) requestByVisit.set(v, r);
  }
  const visits = [];
  for (const [id, list] of groupBySession(events)) {
    // A visit starts with a page view; sessions without one are fragments
    // (a tab left open across the period start) and only muddle the counts.
    if (!list.some((e) => e.event_name === "page_view")) continue;
    visits.push(summarize(id, list, requestByVisit));
  }
  visits.sort((a, b) => b.start.localeCompare(a.start));

  const funnel = FUNNEL.map(([key, label]) => ({
    key,
    label,
    count: key === "visits" ? visits.length : visits.filter((v) => v[key]).length,
  }));

  // Per page, per section: how many visits got there, and how long the ones
  // who read it stayed (median, so one tab left open doesn't skew it). A
  // section's share counts only the visits that started after it first showed
  // up — a section added today isn't measured against last week's visits.
  const pagesByPath = new Map();
  const startsByPath = new Map(); // path → [visit start, …]
  for (const [, list] of groupBySession(events)) {
    const viewed = new Set(list.filter((e) => e.event_name === "page_view").map((e) => pagePath(e.props?.page)));
    if (!viewed.size) continue;
    const start = list[0].occurred_at;
    const reached = new Map(); // path → Map(section → order)
    const secs = new Map(); // path → Map(section → seconds)
    for (const e of list) {
      const p = e.props || {};
      const path = p.page && p.page.startsWith("/") ? p.page : null;
      if (e.event_name === "section_view" && path) {
        if (!reached.has(path)) reached.set(path, new Map());
        reached.get(path).set(p.section, Number(p.order) || 0);
      }
      if (e.event_name === "engagement" && path) {
        if (!secs.has(path)) secs.set(path, new Map());
        for (const [s, n] of Object.entries(p.s || {})) secs.get(path).set(s, (secs.get(path).get(s) || 0) + (Number(n) || 0));
      }
    }
    for (const path of viewed) {
      if (!pagesByPath.has(path)) pagesByPath.set(path, { page: path, visits: 0, sections: new Map() });
      const pg = pagesByPath.get(path);
      pg.visits += 1;
      if (!startsByPath.has(path)) startsByPath.set(path, []);
      startsByPath.get(path).push(start);
      const names = new Set([...(reached.get(path)?.keys() || []), ...(secs.get(path)?.keys() || [])]);
      for (const s of names) {
        if (!pg.sections.has(s)) pg.sections.set(s, { section: s, order: 0, reached: 0, times: [], since: start });
        const row = pg.sections.get(s);
        if (start < row.since) row.since = start;
        row.order = Math.max(row.order, reached.get(path)?.get(s) || 0);
        row.reached += 1;
        const n = secs.get(path)?.get(s) || 0;
        if (n > 0) row.times.push(n);
      }
    }
  }
  const pages = [...pagesByPath.values()]
    .map((pg) => ({
      page: pg.page,
      visits: pg.visits,
      sections: [...pg.sections.values()]
        .map(({ section, order, reached, times, since }) => ({
          section, order, reached, since,
          visits: (startsByPath.get(pg.page) || []).filter((t) => t >= since).length,
          readers: times.length, medianSecs: median(times), totalSecs: times.reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => a.order - b.order || b.reached - a.reached),
    }))
    .sort((a, b) => b.visits - a.visits);

  return { visits, funnel, pages };
}

// One visit, step by step, for the journey view.
export function visitTimeline({ events, request = null }) {
  const steps = [];
  for (const e of [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
    const p = e.props || {};
    const at = e.occurred_at;
    switch (e.event_name) {
      case "page_view": steps.push({ at, kind: "page", page: pagePath(p.page) }); break;
      case "section_view": steps.push({ at, kind: "section", page: p.page || "/", section: p.section }); break;
      case "click": steps.push({ at, kind: "click", label: p.label || "", href: p.href || null, section: p.section || null, page: p.page || null }); break;
      case "cta_click": break; // the click event says the same, with the label
      case "copy": steps.push({ at, kind: "copy", section: p.section || null, chars: p.chars || 0 }); break;
      case "request_open": steps.push({ at, kind: "open", from: p.source || "" }); break;
      case "request_field": steps.push({ at, kind: "field", field: p.field }); break;
      case "request_close": steps.push({ at, kind: "close", fields: p.fields || [], secs: p.secs || 0 }); break;
      case "request_error": steps.push({ at, kind: "error", error: p.error || "" }); break;
      case "request_sent": steps.push({ at, kind: "sent" }); break;
      default: break;
    }
  }
  // Consecutive form-field touches read better as one line.
  const merged = [];
  for (const s of steps) {
    const last = merged[merged.length - 1];
    if (s.kind === "field" && last?.kind === "fields") { if (!last.fields.includes(s.field)) last.fields.push(s.field); continue; }
    merged.push(s.kind === "field" ? { at: s.at, kind: "fields", fields: [s.field] } : s);
  }
  const summary = summarizeVisits({ events, requests: request ? [request] : [] }).visits[0] || null;
  return { summary, steps: merged };
}
