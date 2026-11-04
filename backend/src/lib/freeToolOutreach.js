// The free event tool's outreach, as /admin/free-tool shows it: the event
// organisers in the sales sheet (Track = Event), which of them Felix has
// mailed, who opened their link (lib/mailClicks.js), who made an account on
// the event tool, and whether they've made and published events since.
// Pure: sheet prospects, mail clicks and organiser accounts in, plain
// objects out.
//
// What counts is what happened after the mail: an account made on or after
// the day it was sent (an older one, like an old PullUp host's, is "had an
// account already"), and events made since that day, whoever's account.
//
// An account belongs to a prospect when its email is one of the prospect's
// addresses, or, for an address on the prospect's own domain (not a free mail
// service), when the account's email is on that domain too.

const ANSWERED = new Set(["Replied", "Meeting booked", "Proposal sent", "Won"]);
const NO = new Set(["Lost", "Not a fit"]);
const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|mac|proton|protonmail|aol|gmx|naver|telia|spray|bredband|comhem)\./i;

const emailsOf = (s) => String(s || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
const domainOf = (e) => e.split("@")[1] || "";
const day = (iso) => String(iso || "").slice(0, 10);

function addDays(d, n) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// prospects: parseProspects() rows; clicks: mailClicks() rows;
// accounts: platformStats().accounts ({ id, email, createdAt, events, published, signups, brands }).
export function summarizeFreeTool({ prospects, clicks = [], accounts = [], today, days = 30 }) {
  const list = prospects.filter((p) => p.track === "Event");
  const withEmail = list.filter((p) => emailsOf(p.email).length);
  const contacted = list.filter((p) => p.dateSent);
  const clickBy = new Map(clicks.map((c) => [c.id, c]));

  const byEmail = new Map();
  const byDomain = new Map();
  for (const a of accounts) {
    const e = String(a.email || "").toLowerCase();
    if (!e) continue;
    byEmail.set(e, a);
    const d = domainOf(e);
    if (d && !FREE_MAIL.test(d)) (byDomain.get(d) || byDomain.set(d, []).get(d)).push(a);
  }
  const accountOf = (p) => {
    const mails = emailsOf(p.email);
    for (const m of mails) if (byEmail.has(m)) return byEmail.get(m);
    for (const m of mails) {
      const d = domainOf(m);
      if (!FREE_MAIL.test(d) && byDomain.has(d)) return byDomain.get(d)[0];
    }
    return null;
  };

  // Everyone on the list who has been mailed, clicked or made an account.
  const rows = [];
  const matched = new Set();
  for (const p of list) {
    const c = clickBy.get(p.id) || null;
    const a = accountOf(p);
    if (a) matched.add(a.id);
    if (!p.dateSent && !c) continue;
    const from = p.dateSent || day(c?.first);
    const after = (a?.eventList || []).filter((e) => day(e.createdAt) >= from);
    rows.push({
      id: p.id,
      company: p.company,
      person: p.person,
      email: p.email,
      list: String(p.source || "").replace(/^Event:\s*/, ""),
      dateSent: p.dateSent || null,
      stage: p.stage,
      answered: ANSWERED.has(p.stage),
      no: NO.has(p.stage),
      clicked: c ? { first: c.first, last: c.last, visits: c.visits.length, active: c.active, glanceOnly: c.glanceOnly, pages: c.pages } : null,
      account: a ? {
        createdAt: a.createdAt,
        before: day(a.createdAt) < from,
        events: after.length,
        published: after.filter((e) => e.published).length,
        signups: after.reduce((n, e) => n + (e.signups || 0), 0),
        brands: (a.brands || []).map((b) => b.name),
      } : null,
    });
  }
  rows.sort((x, y) => String(y.dateSent || y.account?.createdAt || "").localeCompare(String(x.dateSent || x.account?.createdAt || "")));

  // Clicks that were a person, not a mail filter opening the link.
  const realClick = (r) => r.clicked && !r.clicked.glanceOnly;
  const mailed = rows.filter((r) => r.dateSent);
  const totals = {
    listed: list.length,
    withEmail: withEmail.length,
    contacted: contacted.length,
    today: contacted.filter((p) => p.dateSent === today).length,
    clicked: mailed.filter(realClick).length,
    answered: mailed.filter((r) => r.answered).length,
    no: mailed.filter((r) => r.no).length,
    accounts: rows.filter((r) => r.account && !r.account.before).length,
    hadAccount: rows.filter((r) => r.account?.before).length,
    withEvent: rows.filter((r) => r.account?.events > 0).length,
    published: rows.filter((r) => r.account?.published > 0).length,
    signups: rows.reduce((n, r) => n + (r.account?.signups || 0), 0),
  };

  // The days since the first mail (at most `days`): sent, clicked, accounts.
  const first = contacted.map((p) => p.dateSent).sort()[0] || today;
  const start = first > addDays(today, -(days - 1)) ? first : addDays(today, -(days - 1));
  const series = [];
  for (let d = start; d <= today; d = addDays(d, 1)) series.push({ date: d, sent: 0, clicked: 0, accounts: 0 });
  const at = new Map(series.map((s) => [s.date, s]));
  for (const r of rows) {
    if (r.dateSent && at.has(r.dateSent)) at.get(r.dateSent).sent += 1;
    if (realClick(r) && at.has(day(r.clicked.first))) at.get(day(r.clicked.first)).clicked += 1;
    if (r.account && !r.account.before && at.has(day(r.account.createdAt))) at.get(day(r.account.createdAt)).accounts += 1;
  }

  // Per source list: how each one answers.
  const lists = new Map();
  for (const p of list) {
    const k = String(p.source || "").replace(/^Event:\s*/, "") || "–";
    if (!lists.has(k)) lists.set(k, { list: k, listed: 0, contacted: 0, clicked: 0, accounts: 0 });
    const o = lists.get(k);
    o.listed += 1;
    if (p.dateSent) o.contacted += 1;
  }
  for (const r of rows) {
    const o = lists.get(r.list || "–");
    if (!o) continue;
    if (r.dateSent && realClick(r)) o.clicked += 1;
    if (r.account && !r.account.before) o.accounts += 1;
  }

  // New accounts since the first mail that aren't on the list: found the tool
  // some other way. Shows whether the mail is what's working.
  const elsewhere = first === today && !contacted.length ? [] : accounts.filter((a) => !matched.has(a.id) && day(a.createdAt) >= first);

  return {
    totals,
    series,
    lists: [...lists.values()].sort((a, b) => b.contacted - a.contacted || b.listed - a.listed),
    rows,
    elsewhere: elsewhere.map((a) => ({ email: a.email, createdAt: a.createdAt, events: a.events || 0, published: a.published || 0 })),
    since: contacted.length ? first : null,
  };
}
