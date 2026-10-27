// Who came to pullup.se from Felix's outreach mail, and what they read.
// Pure: prospects and analytics rows in, plain objects out.
//
// Every outreach mail links "pullup.se" to https://pullup.se/?m=<code>, one
// code per prospect (sheet column "Mail link"). The site turns ?m= into
// utm_source "mejl" + utm_content <code> (frontend/src/lib/track.js), so the
// visit that click opened belongs to that prospect.
// A visitor who also switched the stats cookie on keeps one visitor_id across
// visits (visitor_id ≠ session_id), so their later visits, with or without
// the link, belong to the prospect too.
import { summarizeVisits } from "./visitJourneys.js";

export const MAIL_LINK_HEADER = "Mail link";
export const mailLink = (code) => `https://pullup.se/?m=${code}`;

// Short, unambiguous: no 0/o, 1/l.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export function newLinkCode(taken = new Set(), random = Math.random) {
  for (;;) {
    let c = "";
    for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(random() * ALPHABET.length)];
    if (!taken.has(c)) return c;
  }
}

const codeOf = (e) => (e.utm?.utm_source === "mejl" && e.utm?.utm_content) || null;
const kept = (e) => e.visitor_id && e.visitor_id !== e.session_id; // stats cookie on

// The sessions to load for a set of link codes: the clicked ones, then every
// session of a visitor who clicked with the cookie on.
export function clickSessions(linkRows) {
  const sessions = new Set();
  const visitors = new Set();
  for (const e of linkRows) {
    if (e.session_id) sessions.add(e.session_id);
    if (kept(e)) visitors.add(e.visitor_id);
  }
  return { sessions: [...sessions], visitors: [...visitors] };
}

// prospects: [{ id, company, person, email, stage, linkCode }]
// events: every visit event of the sessions above (VISIT_COLUMNS + utm).
export function summarizeMailClicks({ prospects, events }) {
  const byCode = new Map(prospects.filter((p) => p.linkCode).map((p) => [p.linkCode, p]));
  const prospectBySession = new Map();
  const prospectByVisitor = new Map();
  const viaLink = new Set();
  for (const e of events) {
    const p = byCode.get(codeOf(e));
    if (!p) continue;
    prospectBySession.set(e.session_id, p);
    viaLink.add(e.session_id);
    if (kept(e)) prospectByVisitor.set(e.visitor_id, p);
  }
  for (const e of events) {
    if (!prospectBySession.has(e.session_id) && kept(e) && prospectByVisitor.has(e.visitor_id)) {
      prospectBySession.set(e.session_id, prospectByVisitor.get(e.visitor_id));
    }
  }

  const { visits } = summarizeVisits({ events: events.filter((e) => prospectBySession.has(e.session_id)) });
  const out = new Map();
  for (const v of visits) {
    const p = prospectBySession.get(v.id);
    if (!out.has(p.id)) {
      out.set(p.id, {
        id: p.id, company: p.company, person: p.person, email: p.email, stage: p.stage,
        returned: false, clicks: 0, visits: [], active: 0, offer: false, opened: false, sent: false, pages: new Set(),
      });
    }
    const o = out.get(p.id);
    const link = viaLink.has(v.id);
    if (link) o.clicks += 1;
    else o.returned = true; // came back without the link: recognised by the cookie
    // Mail filters open links in a browser of their own the moment a mail
    // lands: one page, the first section, no clicks. A person scrolls on.
    const glance = v.sections <= 1 && v.clicks === 0 && v.pages.length <= 1;
    o.visits.push({ id: v.id, start: v.start, viaLink: link, active: v.active, pages: v.pages, offer: v.offer, sent: v.sent, glance });
    o.active += v.active;
    o.offer ||= v.offer;
    o.opened ||= v.opened;
    o.sent ||= v.sent;
    for (const pg of v.pages) o.pages.add(pg);
  }
  // Said yes to the cookie: their later visits will show up here too.
  for (const p of prospectByVisitor.values()) if (out.has(p.id)) out.get(p.id).cookie = true;

  return [...out.values()]
    .map((o) => {
      o.visits.sort((a, b) => b.start.localeCompare(a.start));
      return { ...o, cookie: !!o.cookie, glanceOnly: o.visits.every((v) => v.glance), pages: [...o.pages], first: o.visits[o.visits.length - 1].start, last: o.visits[0].start };
    })
    .sort((a, b) => b.last.localeCompare(a.last));
}
