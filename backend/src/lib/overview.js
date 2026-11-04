// The owner's Översikt (/admin): the agency and the event tool as one picture.
// Pure: the sheet's prospects, the mail clicks (lib/mailClicks.js), the
// organiser accounts, the period's visits (lib/visitJourneys.js), site checks
// and requests in, plain objects out.
//
// Two questions, one page:
//   flows  — where people came from (each outreach list, each traffic source)
//            and how far they got, whichever product they ended up in: read
//            on, tested their site, looked at the event tool, made an account,
//            answered or sent a request, booked a meeting.
//   people — everyone who moved in the period, one row each with their whole
//            path, newest first, with what to do about them.
//
// A prospect's visits are the ones their own mail link opened (and, with the
// cookie on, their later ones); a visit that was only a mail filter opening
// the link (glance) doesn't count. Every other visit is counted by where it
// came from.
import { accountMatcher } from "./freeToolOutreach.js";

const ANSWERED = new Set(["Replied", "Meeting booked", "Proposal sent", "Won"]);
const MET = new Set(["Meeting booked", "Proposal sent", "Won"]);
const TRACKS = [["Marketing", "byra", "Byråns lista"], ["Event", "event", "Eventlistan"]];
const TOOL = "/eventverktyg";
const day = (iso) => String(iso || "").slice(0, 10);

// Where a visit came from, in groups that mean something for sales.
export const SOURCE_GROUPS = [
  ["search", "Sök (Google, Bing)"],
  ["ai", "AI-tjänster"],
  ["social", "Sociala medier"],
  ["pullup", "Från pullup.se"],
  ["mail", "Mejl, okänd mottagare"],
  ["direct", "Direkt / okänd"],
  ["other", "Annat"],
];
export function sourceGroup(source) {
  const s = String(source || "direct").toLowerCase();
  if (s === "direct" || s === "") return "direct";
  if (s === "mejl") return "mail";
  if (s === "pullup") return "pullup";
  if (/google|bing|duckduckgo|ecosia|yahoo|startpage/.test(s)) return "search";
  if (/chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|you\.com/.test(s)) return "ai";
  if (/^(ig|fb|li|tt|yt)$|instagram|facebook|linkedin|tiktok|twitter|^x$|threads|youtube|snapchat|pinterest/.test(s)) return "social";
  return "other";
}

const checkOf = (visit) => (visit.inputs || []).filter((i) => i.form === "site_check");
const sawTool = (visit) => (visit.pages || []).includes(TOOL);

// What a site check said, for a person's row.
function checkLabel(result) {
  if (typeof result === "number") return `${result} av 100`;
  return { blocked: "stänger ute maskiner", unreachable: "svarade inte", unreadable: "kunde inte läsas" }[result] || null;
}

// What to do about someone, from where they are. First match wins.
function hintFor(r) {
  if (r.met) return null;
  if (r.lead) return "Svara på förfrågan";
  if (r.answered) return "Svara eller ta nästa steg i Sälj";
  if (r.blocked) return "Sajten stänger ute maskiner: ta upp det";
  if (r.account && !r.account.events) return "Nytt konto: hjälp till med första eventet";
  if (r.account && !r.account.published) return "Har ett utkast: hjälp till att publicera";
  if (r.account?.published) return "Har publicerat: hör hur det går";
  if (r.visited) return "Har läst: följ upp medan de minns dig";
  if (r.check) return "Testade sajten: hör av dig om resultatet";
  return null;
}

// prospects: parseProspects() rows (both tracks); clicks: mailClicks();
// accounts: platformStats().accounts; visits: summarizeVisits().visits for
// the period; checks: site_checks rows; requests: agency_requests rows
// ({ id, created_at, name, company, email, visit_id }); since: "YYYY-MM-DD".
export function summarizeOverview({ prospects = [], clicks = [], accounts = [], visits = [], checks = [], requests = [], since }) {
  const clickBy = new Map(clicks.map((c) => [c.id, c]));
  const accountOf = accountMatcher(accounts);
  const prospectVisits = new Set(clicks.flatMap((c) => c.visits.map((v) => v.id)));
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const matched = new Set();
  const people = [];

  // The outreach lists, one row each.
  const flows = [];
  for (const [track, key, label] of TRACKS) {
    const row = { key, label, mail: true, mailed: 0, visited: 0, read: 0, tested: 0, tool: 0, accounts: 0, answered: 0, meetings: 0 };
    for (const p of prospects.filter((x) => x.track === track)) {
      const c = clickBy.get(p.id);
      const a = accountOf(p);
      if (a) matched.add(a.id);
      const seen = (c?.visits || []).filter((v) => !v.glance && day(v.start) >= since);
      const mailed = !!p.dateSent && p.dateSent >= since;
      const from = p.dateSent || day(c?.first) || since;
      const fresh = a && day(a.createdAt) >= from && day(a.createdAt) >= since ? a : null;
      const answeredNow = ANSWERED.has(p.stage) && (mailed || (p.lastContact || "") >= since);
      if (!mailed && !seen.length && !fresh && !answeredNow) continue;
      const checksSeen = seen.flatMap((v) => v.checks || []);
      const r = {
        kind: "prospect",
        track: key,
        id: p.id,
        name: p.company,
        sub: p.person || p.email || "",
        dateSent: p.dateSent || null,
        stage: p.stage,
        visited: seen.length > 0,
        visits: seen.length,
        read: seen.some((v) => v.read),
        tool: seen.some((v) => (v.pages || []).includes(TOOL)),
        check: checksSeen.length ? checkLabel(checksSeen[checksSeen.length - 1].result) : null,
        blocked: checksSeen.some((x) => x.result === "blocked"),
        account: fresh ? {
          createdAt: fresh.createdAt,
          events: (fresh.eventList || []).filter((e) => day(e.createdAt) >= from).length,
          published: (fresh.eventList || []).filter((e) => day(e.createdAt) >= from && e.published).length,
        } : null,
        answered: answeredNow,
        met: MET.has(p.stage) && answeredNow,
        visitId: seen[0]?.id || null, // newest first
        last: [seen[0]?.start, fresh?.createdAt, answeredNow ? p.lastContact : null, mailed ? p.dateSent : null].filter(Boolean).sort().pop(),
      };
      row.mailed += mailed ? 1 : 0;
      row.visited += r.visited ? 1 : 0;
      row.read += r.read ? 1 : 0;
      row.tested += checksSeen.length ? 1 : 0;
      row.tool += r.tool ? 1 : 0;
      row.accounts += r.account ? 1 : 0;
      row.answered += r.answered ? 1 : 0;
      row.meetings += r.met ? 1 : 0;
      // Mailed and nothing since isn't movement: it stays in the counts only.
      if (r.visited || r.account || r.answered) people.push({ ...r, hint: hintFor(r) });
    }
    flows.push(row);
  }

  // Every other visit, by where it came from.
  const bySource = new Map(SOURCE_GROUPS.map(([key, label]) => [key, { key, label, mail: false, visits: 0, read: 0, tested: 0, tool: 0, requests: 0 }]));
  for (const v of visits) {
    if (prospectVisits.has(v.id)) continue;
    const row = bySource.get(sourceGroup(v.source));
    row.visits += 1;
    row.read += v.read ? 1 : 0;
    row.tested += checkOf(v).length ? 1 : 0;
    row.tool += sawTool(v) ? 1 : 0;
    row.requests += v.sent ? 1 : 0;
  }
  const sources = [...bySource.values()].filter((r) => r.visits > 0).sort((a, b) => b.visits - a.visits);

  // Accounts nobody on the lists made: they found the tool some other way.
  const elsewhere = accounts.filter((a) => !matched.has(a.id) && day(a.createdAt) >= since);
  const other = {
    visits: sources.reduce((n, r) => n + r.visits, 0),
    read: sources.reduce((n, r) => n + r.read, 0),
    tested: sources.reduce((n, r) => n + r.tested, 0),
    tool: sources.reduce((n, r) => n + r.tool, 0),
    requests: sources.reduce((n, r) => n + r.requests, 0),
    accounts: elsewhere.length,
  };

  // People who aren't on a list: requests, site checks, new accounts.
  for (const q of requests) {
    if (day(q.created_at) < since) continue;
    if (q.visit_id && prospectVisits.has(q.visit_id)) continue;
    const r = { kind: "lead", track: "byra", id: q.id, name: q.company || q.name || q.email, sub: [q.name, q.email].filter(Boolean).join(" · "), lead: true, visitId: q.visit_id || null, last: q.created_at, source: q.visit_id ? visitById.get(q.visit_id)?.source || null : null };
    people.push({ ...r, hint: hintFor(r) });
  }
  const latestCheck = new Map();
  for (const c of checks) {
    if (day(c.created_at) < since || !c.domain || !["scored", "blocked"].includes(c.outcome)) continue;
    if (["deploy-check", "owner"].includes(c.source) || (c.visit_id && prospectVisits.has(c.visit_id))) continue;
    const prev = latestCheck.get(c.domain);
    if (!prev || c.created_at > prev.created_at) latestCheck.set(c.domain, c);
  }
  for (const c of latestCheck.values()) {
    const result = c.outcome === "scored" ? c.score : c.outcome;
    const v = c.visit_id ? visitById.get(c.visit_id) : null;
    const r = { kind: "check", track: null, id: `check-${c.domain}`, name: c.domain, sub: "", check: checkLabel(result), blocked: c.outcome === "blocked", tool: v ? sawTool(v) : false, read: v ? v.read : false, visitId: c.visit_id || null, last: c.created_at, source: v?.source || null };
    people.push({ ...r, hint: hintFor(r) });
  }
  for (const a of elsewhere) {
    const r = { kind: "account", track: "event", id: `account-${a.id}`, name: (a.brands || [])[0]?.name || a.email, sub: a.email, account: { createdAt: a.createdAt, events: a.events || 0, published: a.published || 0 }, last: a.createdAt };
    people.push({ ...r, hint: hintFor(r) });
  }
  people.sort((x, y) => String(y.last || "").localeCompare(String(x.last || "")));

  return { since, flows, sources, other, people };
}
