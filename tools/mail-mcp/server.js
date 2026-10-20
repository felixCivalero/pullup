// Local MCP for felix@pullup.se — the one.com mailbox — plus the mail half of
// the sales pipeline: the Google Sheet (SALES_SHEET_ID) is the CRM. Claude
// reads threads, writes drafts into one.com's Drafts folder, and syncs sent
// and received mail into the sheet (Date sent, Last contact, Stage, Log).
//
// Sending is OFF unless MAIL_SEND_ENABLED=true: by default Claude drafts and
// Felix presses send in mail.one.com. The next sales_sync_mail picks it up.
//
// Credentials: tools/mail-mcp/.env (ONECOM_USER, ONECOM_PASSWORD, see
// .env.example); the Google service account and sheet ID come from
// backend/.env.

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { batchGetValues, batchUpdateValues } from '../../backend/src/lib/googleSheets.js';
import { planMailSync } from '../../backend/src/lib/salesMailSync.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '.env'), quiet: true });
dotenv.config({ path: path.join(here, '../../backend/.env'), quiet: true });

const USER = process.env.ONECOM_USER || 'felix@pullup.se';
const PASS = process.env.ONECOM_PASSWORD;
const FROM = { name: process.env.MAIL_FROM_NAME || 'Felix Civalero', address: USER };
const SEND_ENABLED = process.env.MAIL_SEND_ENABLED === 'true';
const IMAP = { host: process.env.ONECOM_IMAP_HOST || 'imap.one.com', port: 993, secure: true };
const SMTP = { host: process.env.ONECOM_SMTP_HOST || 'send.one.com', port: 465, secure: true };
// Felix's CV, attached to drafts by default (assets/ is gitignored).
const CV = { filename: 'CV_Felix_Civalero_Stolpe.pdf', path: path.join(here, 'assets', 'CV_Felix_Civalero_Stolpe.pdf'), contentType: 'application/pdf' };

const SHEET = process.env.SALES_SHEET_ID;
const sheetReady = () => !!SHEET && !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

// ---------------------------------------------------------------- imap

async function withImap(fn) {
  if (!PASS) throw new Error('ONECOM_PASSWORD missing — add it to tools/mail-mcp/.env');
  const client = new ImapFlow({ ...IMAP, auth: { user: USER, pass: PASS }, logger: false });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

// one.com names folders its own way; trust the server's special-use flags.
async function folders(client) {
  const list = await client.list();
  const pick = (flag, ...names) =>
    list.find((m) => m.specialUse === flag)?.path ||
    list.find((m) => names.includes(m.path) || names.includes(m.name))?.path ||
    names[0];
  return {
    inbox: 'INBOX',
    sent: pick('\\Sent', 'Sent', 'INBOX.Sent', 'Sent Items'),
    drafts: pick('\\Drafts', 'Drafts', 'INBOX.Drafts'),
  };
}

const addr = (list) => (list || []).map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ');
const bare = (list) => (list || []).map((a) => (a.address || '').toLowerCase()).filter(Boolean);

function summarize(msg, folder) {
  const e = msg.envelope || {};
  return {
    folder,
    uid: msg.uid,
    date: (e.date || msg.internalDate)?.toISOString?.() ?? null,
    from: addr(e.from),
    to: addr(e.to),
    cc: addr(e.cc) || undefined,
    subject: e.subject || '',
    message_id: e.messageId || null,
    seen: msg.flags?.has?.('\\Seen') ?? undefined,
  };
}

// Search one folder; newest first, capped at `limit`.
async function searchFolder(client, folder, criteria, limit) {
  const lock = await client.getMailboxLock(folder);
  try {
    const uids = (await client.search(criteria, { uid: true })) || [];
    const pickUids = uids.sort((a, b) => b - a).slice(0, limit);
    if (!pickUids.length) return [];
    const out = [];
    for await (const msg of client.fetch(pickUids, { envelope: true, flags: true, internalDate: true, uid: true }, { uid: true })) {
      out.push(summarize(msg, folder));
    }
    return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } finally {
    lock.release();
  }
}

async function readMessage(client, folder, uid) {
  const lock = await client.getMailboxLock(folder);
  try {
    const msg = await client.fetchOne(String(uid), { source: true, envelope: true, uid: true }, { uid: true });
    if (!msg) throw new Error(`No message uid ${uid} in ${folder}`);
    const parsed = await simpleParser(msg.source);
    return {
      folder,
      uid: msg.uid,
      date: parsed.date?.toISOString() ?? null,
      from: parsed.from?.text || '',
      to: parsed.to?.text || '',
      cc: parsed.cc?.text || undefined,
      subject: parsed.subject || '',
      message_id: parsed.messageId || null,
      in_reply_to: parsed.inReplyTo || null,
      references: [].concat(parsed.references || []),
      text: (parsed.text || '').trim(),
      attachments: (parsed.attachments || []).map((a) => ({ filename: a.filename, type: a.contentType, size: a.size })),
    };
  } finally {
    lock.release();
  }
}

const baseSubject = (s) => (s || '').replace(/^\s*((re|sv|vs|fw|fwd|aw)\s*:\s*)+/i, '').trim();

// Build the RFC822 message once, so what we send, what lands in Sent and
// what we log all share the same Message-ID.
async function compose({ to, cc, bcc, subject, text, reply, attachments = [] }) {
  const messageId = `<${randomUUID()}@pullup.se>`;
  const headers = {};
  let subj = subject;
  if (reply) {
    headers['In-Reply-To'] = reply.message_id;
    headers.References = [...reply.references, reply.message_id].filter(Boolean).join(' ');
    if (!subj) subj = /^\s*(re|sv)\s*:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`;
  }
  const mail = new MailComposer({ from: FROM, to, cc, bcc, subject: subj, text, messageId, headers, attachments });
  const raw = await mail.compile().build();
  return { raw, messageId, subject: subj };
}

const replyContext = (client, ref) => (ref ? readMessage(client, ref.folder, ref.uid) : null);

// ---------------------------------------------------------------- sheet

const stockholmDay = (d) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const colLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

// Auto-replies: out-of-office, ticket receipts, "thanks for your application".
const AUTO_SUBJECT = /^\s*(automatic reply|automatiskt svar|autosvar|auto[- ]?reply|autoreply|out of office|frånvaro|abwesend|fraværende|\[[^\]]*\]\s*förfrågan mottagen|vi har tagit emot|ärende mottaget|ticket received|we('|’)ve received)/i;
const isAuto = (headers, subject) => {
  const h = (headers || Buffer.alloc(0)).toString('utf8').toLowerCase();
  return /auto-submitted:\s*auto-(replied|generated)/.test(h) || /x-autore(ply|spond)/.test(h) || /precedence:\s*(auto_reply|bulk|junk)/.test(h) || AUTO_SUBJECT.test(subject || '');
};

// Every message in INBOX and Sent since `since`, as the sync planner wants it,
// plus the UIDs of unread auto-replies in INBOX (to mark read).
async function recentMessages(client, since) {
  const f = await folders(client);
  const out = [];
  const unreadAuto = [];
  for (const [folder, dir] of [[f.inbox, 'in'], [f.sent, 'out']]) {
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = (await client.search({ since }, { uid: true })) || [];
      if (!uids.length) continue;
      for await (const msg of client.fetch(uids, { envelope: true, uid: true, internalDate: true, flags: true, headers: ['auto-submitted', 'x-autoreply', 'x-autorespond', 'precedence'] }, { uid: true })) {
        const e = msg.envelope || {};
        const from = bare(e.from);
        const automated = from.some((a) => AUTOMATED.test(a));
        // A "Re:" from a no-reply address is an auto-reply to something we sent.
        const auto = dir === 'in' && (isAuto(msg.headers, e.subject) || (automated && /^\s*(re|sv|aw)\s*:/i.test(e.subject || '')));
        if (auto && !msg.flags?.has?.('\\Seen')) unreadAuto.push(msg.uid);
        if (dir === 'in' && (automated || from.includes(USER.toLowerCase()))) continue;
        out.push({
          dir,
          date: stockholmDay(e.date || msg.internalDate || new Date()),
          counterparts: dir === 'in' ? from : [...bare(e.to), ...bare(e.cc)],
          subject: e.subject || '',
          messageId: e.messageId || null,
          from: addr(e.from),
          auto,
        });
      }
    } finally {
      lock.release();
    }
  }
  return { messages: out, unreadAuto, inbox: f.inbox };
}

const AUTOMATED = /(no-?reply|noreply|mailer-daemon|notifications?|newsletter|bounce|support@|info@one\.com)/i;

// ---------------------------------------------------------------- server

const server = new McpServer({ name: 'onecom-mail', version: '1.0.0' });
const json = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] });
const msgRef = z.object({ folder: z.string(), uid: z.number().int() });

server.registerTool(
  'mail_search',
  {
    description:
      'Search felix@pullup.se (one.com). Searches INBOX and Sent by default. Returns envelopes (folder+uid identify a message for mail_read/replies). Use `with` to get all mail to OR from one address.',
    inputSchema: {
      with: z.string().optional().describe('Email address: matches From, To or Cc'),
      from: z.string().optional(),
      to: z.string().optional(),
      subject: z.string().optional(),
      text: z.string().optional().describe('Free text in the body'),
      since: z.string().optional().describe('ISO date, e.g. 2026-10-01'),
      unread_only: z.boolean().optional(),
      folders: z.array(z.enum(['inbox', 'sent', 'drafts'])).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  async (a) =>
    withImap(async (client) => {
      const f = await folders(client);
      const crit = {};
      if (a.with) crit.or = [{ from: a.with }, { to: a.with }, { cc: a.with }];
      if (a.from) crit.from = a.from;
      if (a.to) crit.to = a.to;
      if (a.subject) crit.subject = a.subject;
      if (a.text) crit.body = a.text;
      if (a.since) crit.since = new Date(a.since);
      if (a.unread_only) crit.seen = false;
      if (!Object.keys(crit).length) crit.all = true;
      const limit = a.limit ?? 30;
      const results = [];
      for (const key of a.folders ?? ['inbox', 'sent']) {
        results.push(...(await searchFolder(client, f[key], crit, limit)));
      }
      results.sort((x, y) => (y.date || '').localeCompare(x.date || ''));
      return json(results.slice(0, limit));
    })
);

server.registerTool(
  'mail_read',
  { description: 'Read one message in full (plain text body, headers, attachment list).', inputSchema: msgRef.shape },
  async ({ folder, uid }) => withImap(async (client) => json(await readMessage(client, folder, uid)))
);

server.registerTool(
  'mail_thread',
  {
    description:
      'A whole conversation, oldest first, across INBOX and Sent: every message with the same base subject (Re:/Sv: stripped), optionally narrowed to one counterpart address. Bodies included.',
    inputSchema: {
      subject: z.string(),
      with: z.string().optional().describe('Counterpart address to narrow the thread'),
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  async ({ subject, with: other, limit = 20 }) =>
    withImap(async (client) => {
      const f = await folders(client);
      const crit = { subject: baseSubject(subject) };
      if (other) crit.or = [{ from: other }, { to: other }, { cc: other }];
      const hits = [];
      for (const folder of [f.inbox, f.sent]) hits.push(...(await searchFolder(client, folder, crit, limit)));
      hits.sort((x, y) => (x.date || '').localeCompare(y.date || ''));
      const full = [];
      for (const h of hits.slice(-limit)) full.push(await readMessage(client, h.folder, h.uid));
      return json(full);
    })
);

const outgoing = {
  to: z.union([z.string(), z.array(z.string())]),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  bcc: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().optional().describe('Required unless replying'),
  text: z.string().describe('Plain-text body, signature included'),
  reply_to: msgRef.optional().describe('folder+uid of the message being answered; sets threading headers and Re: subject'),
};

server.registerTool(
  'mail_draft',
  {
    description:
      "Save a draft in felix@pullup.se's Drafts folder at one.com. Felix reviews and sends it from mail.one.com (or his phone). This is the default way to write mail. Felix's CV (PDF) is attached unless attach_cv is false. `replaces` removes an earlier draft (by its message_id) so a corrected draft doesn't leave a duplicate.",
    inputSchema: {
      ...outgoing,
      attach_cv: z.boolean().optional().describe('Attach CV_Felix_Civalero_Stolpe.pdf (default true)'),
      replaces: z.string().optional().describe('message_id of an earlier draft to delete'),
    },
  },
  async (a) =>
    withImap(async (client) => {
      const f = await folders(client);
      const reply = await replyContext(client, a.reply_to);
      if (!a.subject && !reply) throw new Error('subject is required for a new message');
      const attachments = a.attach_cv === false ? [] : [CV];
      const { raw, messageId, subject } = await compose({ ...a, reply, attachments });
      await client.append(f.drafts, raw, ['\\Draft', '\\Seen']);
      let replaced = 0;
      if (a.replaces) {
        const lock = await client.getMailboxLock(f.drafts);
        try {
          const uids = (await client.search({ header: { 'message-id': a.replaces } }, { uid: true })) || [];
          if (uids.length) {
            await client.messageDelete(uids, { uid: true });
            replaced = uids.length;
          }
        } finally {
          lock.release();
        }
      }
      return json({ saved_to: f.drafts, subject, message_id: messageId, cv_attached: attachments.length > 0, replaced });
    })
);

server.registerTool(
  'mail_send',
  {
    description:
      'Send immediately from felix@pullup.se via one.com SMTP and file a copy in Sent (sales_sync_mail then records it in the sheet). Disabled unless MAIL_SEND_ENABLED=true — prefer mail_draft. Only send what Felix has explicitly approved.',
    inputSchema: outgoing,
  },
  async (a) => {
    if (!SEND_ENABLED) throw new Error('Sending is disabled (MAIL_SEND_ENABLED != true). Use mail_draft.');
    return withImap(async (client) => {
      const f = await folders(client);
      const reply = await replyContext(client, a.reply_to);
      if (!a.subject && !reply) throw new Error('subject is required for a new message');
      const { raw, messageId, subject } = await compose({ ...a, reply });
      const rcpt = [a.to, a.cc, a.bcc].flat().filter(Boolean);
      const transport = nodemailer.createTransport({ ...SMTP, auth: { user: USER, pass: PASS } });
      const info = await transport.sendMail({ envelope: { from: USER, to: rcpt }, raw });
      await client.append(f.sent, raw, ['\\Seen']);
      return json({ sent: true, accepted: info.accepted, message_id: messageId, subject, next: 'run sales_sync_mail to record it in the sheet' });
    });
  }
);

server.registerTool(
  'sales_sync_mail',
  {
    description:
      "Record recent mail (INBOX + Sent) in the sales sheet: for each prospect emailed or answering, sets Date sent (first email), Last contact, moves Stage forward (Not contacted → Emailed → Followed up → Replied; never touches Meeting booked and later) and logs each message once in the Log tab. Auto-replies (out-of-office, ticket receipts) are logged as notes, never count as an answer, and are marked read in INBOX. Matches by address, or by company domain for shared inboxes. Returns what changed plus inbound senders not on the list. Run before any pipeline review and after Felix has sent mail. dry_run shows the plan without writing.",
    inputSchema: {
      since_days: z.number().int().min(1).max(365).optional(),
      dry_run: z.boolean().optional(),
    },
  },
  async ({ since_days = 30, dry_run = false }) =>
    withImap(async (client) => {
      if (!sheetReady()) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON / SALES_SHEET_ID missing (backend/.env)');
      const since = new Date(Date.now() - since_days * 86400000);
      const { messages, unreadAuto, inbox } = await recentMessages(client, since);
      const [prospectRows, logRows] = await batchGetValues(SHEET, ['Prospects!A:X', 'Log!A:F']);
      const plan = planMailSync({ prospectRows, logRows, messages });

      if (!dry_run) {
        const data = plan.updates.map((u) => ({ range: `Prospects!${colLetter(u.col)}${u.row}`, values: [[u.value]] }));
        // Log rows go to exact cells, skipping C (Company is the tab's own formula).
        let next = logRows.length + 1;
        for (const [date, id, , type, subject, mid] of plan.logAppend) {
          data.push({ range: `Log!A${next}:B${next}`, values: [[date, id]] });
          data.push({ range: `Log!D${next}:F${next}`, values: [[type, subject, mid]] });
          next += 1;
        }
        if (data.length) await batchUpdateValues(SHEET, data);
        // Auto-replies don't need Felix: mark them read.
        if (unreadAuto.length) {
          const lock = await client.getMailboxLock(inbox);
          try {
            await client.messageFlagsAdd(unreadAuto, ['\\Seen'], { uid: true });
          } finally {
            lock.release();
          }
        }
      }

      const unknown = new Map();
      for (const m of plan.unknownInbound) {
        const key = m.counterparts[0];
        const u = unknown.get(key) || { email: key, from: m.from, messages: 0, last_subject: '', last_at: '' };
        u.messages += 1;
        if (m.date >= u.last_at) Object.assign(u, { last_at: m.date, last_subject: m.subject });
        unknown.set(key, u);
      }
      return json({
        since: stockholmDay(since),
        dry_run,
        messages_seen: messages.length,
        prospects_changed: plan.changes,
        log_rows_added: plan.logAppend.length,
        auto_replies_marked_read: dry_run ? 0 : unreadAuto.length,
        unread_auto_replies: unreadAuto.length,
        unknown_senders: [...unknown.values()].sort((a, b) => b.last_at.localeCompare(a.last_at)),
      });
    })
);

server.registerTool(
  'mail_check',
  { description: 'Check the one.com login and list folders. Use when setting up or debugging.', inputSchema: {} },
  async () =>
    withImap(async (client) => {
      const f = await folders(client);
      const list = await client.list();
      return json({ user: USER, send_enabled: SEND_ENABLED, sheet_connected: sheetReady(), folders: f, all: list.map((m) => m.path) });
    })
);

await server.connect(new StdioServerTransport());
