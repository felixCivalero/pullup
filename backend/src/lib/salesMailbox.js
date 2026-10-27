// felix@pullup.se (one.com IMAP) → the sales sheet. Reads INBOX and Sent,
// lets planMailSync decide what changes, writes the cells and Log rows and
// marks unread auto-replies read. Shared by the Sälj page's Uppdatera button
// (POST /admin/sales/sync-mail) and the local mail tool (sales_sync_mail).
// Needs ONECOM_PASSWORD (and ONECOM_USER) next to the sheet's env vars.
import { ImapFlow } from "imapflow";
import { batchGetValues, batchUpdateValues } from "./googleSheets.js";
import { planMailSync } from "./salesMailSync.js";

const user = () => process.env.ONECOM_USER || "felix@pullup.se";
export const salesMailboxConfigured = () => !!process.env.ONECOM_PASSWORD && !!process.env.SALES_SHEET_ID && !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const stockholmDay = (d) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const colLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
const addr = (list) => (list || []).map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");
const bare = (list) => (list || []).map((a) => (a.address || "").toLowerCase()).filter(Boolean);

// Auto-replies: out-of-office, ticket receipts, "thanks for your application".
const AUTO_SUBJECT = /^\s*(automatic reply|automatiskt svar|autosvar|auto[- ]?reply|autoreply|out of office|frånvaro|abwesend|fraværende|\[[^\]]*\]\s*förfrågan mottagen|vi har tagit emot|ärende mottaget|ticket received|we('|’)ve received)/i;
const isAuto = (headers, subject) => {
  const h = (headers || Buffer.alloc(0)).toString("utf8").toLowerCase();
  return /auto-submitted:\s*auto-(replied|generated)/.test(h) || /x-autore(ply|spond)/.test(h) || /precedence:\s*(auto_reply|bulk|junk)/.test(h) || AUTO_SUBJECT.test(subject || "");
};
const AUTOMATED = /(no-?reply|noreply|mailer-daemon|notifications?|newsletter|bounce|support@|info@one\.com)/i;

async function withImap(fn) {
  const client = new ImapFlow({
    host: process.env.ONECOM_IMAP_HOST || "imap.one.com",
    port: 993,
    secure: true,
    auth: { user: user(), pass: process.env.ONECOM_PASSWORD },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

// one.com names folders its own way; trust the server's special-use flags.
async function sentFolder(client) {
  const list = await client.list();
  return list.find((m) => m.specialUse === "\\Sent")?.path || list.find((m) => ["Sent", "INBOX.Sent", "Sent Items"].includes(m.path))?.path || "Sent";
}

// Every message in INBOX and Sent since `since`, as the planner wants it,
// plus the UIDs of unread auto-replies in INBOX (to mark read).
async function recentMessages(client, since) {
  const me = user().toLowerCase();
  const out = [];
  const unreadAuto = [];
  for (const [folder, dir] of [["INBOX", "in"], [await sentFolder(client), "out"]]) {
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = (await client.search({ since }, { uid: true })) || [];
      if (!uids.length) continue;
      for await (const msg of client.fetch(uids, { envelope: true, uid: true, internalDate: true, flags: true, headers: ["auto-submitted", "x-autoreply", "x-autorespond", "precedence"] }, { uid: true })) {
        const e = msg.envelope || {};
        const from = bare(e.from);
        const automated = from.some((a) => AUTOMATED.test(a));
        // A "Re:" from a no-reply address is an auto-reply to something we sent.
        const auto = dir === "in" && (isAuto(msg.headers, e.subject) || (automated && /^\s*(re|sv|aw)\s*:/i.test(e.subject || "")));
        if (auto && !msg.flags?.has?.("\\Seen")) unreadAuto.push(msg.uid);
        if (dir === "in" && (automated || from.includes(me))) continue;
        out.push({
          dir,
          date: stockholmDay(e.date || msg.internalDate || new Date()),
          counterparts: dir === "in" ? from : [...bare(e.to), ...bare(e.cc)],
          subject: e.subject || "",
          messageId: e.messageId || null,
          from: addr(e.from),
          auto,
        });
      }
    } finally {
      lock.release();
    }
  }
  return { messages: out, unreadAuto };
}

async function run({ sinceDays, dryRun }) {
  const sheetId = process.env.SALES_SHEET_ID;
  return withImap(async (client) => {
    const since = new Date(Date.now() - sinceDays * 86400000);
    const { messages, unreadAuto } = await recentMessages(client, since);
    const [prospectRows, logRows] = await batchGetValues(sheetId, ["Prospects!A:Z", "Log!A:F"]);
    const plan = planMailSync({ prospectRows, logRows, messages });

    if (!dryRun) {
      const data = plan.updates.map((u) => ({ range: `Prospects!${colLetter(u.col)}${u.row}`, values: [[u.value]] }));
      // Log rows go to exact cells, skipping C (Company is the tab's own formula).
      let next = logRows.length + 1;
      for (const [date, id, , type, subject, mid] of plan.logAppend) {
        data.push({ range: `Log!A${next}:B${next}`, values: [[date, id]] });
        data.push({ range: `Log!D${next}:F${next}`, values: [[type, subject, mid]] });
        next += 1;
      }
      if (data.length) await batchUpdateValues(sheetId, data);
      // Auto-replies don't need Felix: mark them read.
      if (unreadAuto.length) {
        const lock = await client.getMailboxLock("INBOX");
        try {
          await client.messageFlagsAdd(unreadAuto, ["\\Seen"], { uid: true });
        } finally {
          lock.release();
        }
      }
    }

    const unknown = new Map();
    for (const m of plan.unknownInbound) {
      const key = m.counterparts[0];
      const u = unknown.get(key) || { email: key, from: m.from, messages: 0, last_subject: "", last_at: "" };
      u.messages += 1;
      if (m.date >= u.last_at) Object.assign(u, { last_at: m.date, last_subject: m.subject });
      unknown.set(key, u);
    }
    return {
      since: stockholmDay(since),
      dry_run: dryRun,
      messages_seen: messages.length,
      prospects_changed: plan.changes,
      log_rows_added: plan.logAppend.length,
      auto_replies_marked_read: dryRun ? 0 : unreadAuto.length,
      unread_auto_replies: unreadAuto.length,
      unknown_senders: [...unknown.values()].sort((a, b) => b.last_at.localeCompare(a.last_at)),
    };
  });
}

// One sync at a time: a second press while one runs gets the same result,
// so the Log tab never gets the same rows twice.
let running = null;
export function syncSalesMail({ sinceDays = 30, dryRun = false } = {}) {
  if (!process.env.ONECOM_PASSWORD) return Promise.reject(new Error("ONECOM_PASSWORD missing"));
  if (dryRun) return run({ sinceDays, dryRun });
  if (!running) running = run({ sinceDays, dryRun }).finally(() => { running = null; });
  return running;
}
