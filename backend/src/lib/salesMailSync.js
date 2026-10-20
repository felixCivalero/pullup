// Mail → the sales sheet. Pure: the mailbox's messages and the sheet's rows
// in, the cell writes and Log rows out, so it can be tested without IMAP or
// Google. Used by the one.com mail tool (tools/mail-mcp, sales_sync_mail).
//
// For each prospect the mail touches:
//   - Date sent  = the first email Felix sent them (only if still empty)
//   - Last contact = the latest email either way
//   - Stage moves forward only, and only in the outreach part of the funnel:
//     Not contacted → Emailed → Followed up (a second email) → Replied
//     (they wrote back). Meeting booked and later are Felix's to set.
//   - every message is logged once in the Log tab (by Message-ID).
// A prospect matches by exact address, or by company domain when the sheet
// has a shared inbox (info@brand.se) and the person answering is anna@brand.se.
import { rowsToObjects, toDay } from "./salesSummary.js";

const OUTREACH = ["Not contacted", "Emailed", "Followed up", "Replied"];
const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|mac|msn|aol|proton|protonmail|telia|bredband|spray)\./i;
const domainOf = (email) => String(email || "").toLowerCase().split("@")[1] || "";

export function planMailSync({ prospectRows, logRows = [], messages }) {
  const header = prospectRows[0] || [];
  const col = (h) => header.indexOf(h);
  const prospects = rowsToObjects(prospectRows).map((o, i) => ({ o, row: i + 2 }));

  const byEmail = new Map();
  const byDomain = new Map(); // domain → prospect, only when one prospect has it
  const domainCount = new Map();
  for (const p of prospects) {
    const email = String(p.o.Email || "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    byEmail.set(email, p);
    const d = domainOf(email);
    if (d && !FREE_MAIL.test(d)) domainCount.set(d, (domainCount.get(d) || 0) + 1);
  }
  for (const p of prospects) {
    const d = domainOf(p.o.Email);
    if (domainCount.get(d) === 1) byDomain.set(d, p);
  }
  const match = (addresses) => {
    for (const a of addresses) if (byEmail.has(a)) return byEmail.get(a);
    for (const a of addresses) if (byDomain.has(domainOf(a))) return byDomain.get(domainOf(a));
    return null;
  };

  const logHeader = logRows[0] || [];
  const midCol = logHeader.indexOf("Message ID");
  const logged = new Set(midCol >= 0 ? logRows.slice(1).map((r) => String(r[midCol] || "")) : []);

  const touched = new Map(); // row → { p, out: [], in: [] }
  const unknown = [];
  for (const m of [...messages].sort((a, b) => a.date.localeCompare(b.date))) {
    const p = match(m.counterparts);
    if (!p) {
      if (m.dir === "in") unknown.push(m);
      continue;
    }
    const t = touched.get(p.row) || { p, out: [], in: [] };
    t[m.dir].push(m);
    touched.set(p.row, t);
  }

  const updates = [];
  const logAppend = [];
  const changes = [];
  for (const { p, out, in: inbound } of touched.values()) {
    const id = String(p.o.ID || "");
    const set = (h, v) => updates.push({ row: p.row, col: col(h), header: h, value: v });
    const change = { id, company: String(p.o.Company || "") };

    const dateSent = toDay(p.o["Date sent"]);
    if (out.length && !dateSent) {
      set("Date sent", out[0].date);
      change.dateSent = out[0].date;
    }
    const last = [...out, ...inbound].map((m) => m.date).sort().pop();
    const prevLast = toDay(p.o["Last contact"]);
    if (last && (!prevLast || last > prevLast)) {
      set("Last contact", last);
      change.lastContact = last;
    }

    const stage = String(p.o.Stage || "Not contacted").trim() || "Not contacted";
    const firstOut = out[0]?.date;
    const answered = inbound.some((m) => !firstOut || m.date >= firstOut);
    const target = answered ? "Replied" : out.length >= 2 ? "Followed up" : out.length ? "Emailed" : null;
    if (target && OUTREACH.includes(stage) && OUTREACH.indexOf(target) > OUTREACH.indexOf(stage)) {
      set("Stage", target);
      change.stage = `${stage} → ${target}`;
    }

    out.forEach((m, i) => {
      if (m.messageId && !logged.has(m.messageId)) logAppend.push([m.date, id, null, i === 0 && !dateSent ? "Email out" : "Follow-up", m.subject, m.messageId]);
    });
    for (const m of inbound) {
      if (m.messageId && !logged.has(m.messageId)) logAppend.push([m.date, id, null, "Email in", m.subject, m.messageId]);
    }
    if (Object.keys(change).length > 2) changes.push(change);
  }

  return { updates, logAppend, changes, unknownInbound: unknown };
}
