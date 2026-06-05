// backend/src/email/inbound/parseInboundEmail.js
//
// Pure(ish) parsing for inbound guest replies. Kept free of DB/network so the
// fiddly bits (token extraction, quote stripping, auto-reply detection) are
// testable in isolation. The only async piece is MIME parsing via mailparser.

import { simpleParser } from "mailparser";

// Parse a raw MIME message into the fields we care about. Accepts a string or
// Buffer. Returns null on unparseable input rather than throwing.
export async function parseRawEmail(raw) {
  if (!raw) return null;
  try {
    const mail = await simpleParser(raw);
    return {
      from: mail.from?.value?.[0]?.address?.toLowerCase()?.trim() || null,
      toAddresses: (mail.to?.value || []).map((a) => a.address).filter(Boolean),
      subject: mail.subject || null,
      text: mail.text || null,
      html: mail.html || null,
      messageId: mail.messageId || null,
      date: mail.date || null,
      headers: mail.headers || new Map(),
    };
  } catch (err) {
    console.error("[parseInboundEmail] simpleParser failed", err?.message);
    return null;
  }
}

// Find the reply token in any recipient address shaped like
// `<local>+<token>@<domain>` (sub-addressing). Case-insensitive on the local
// part + domain; the token itself is returned verbatim. Returns null if none.
export function extractToken(addresses, { local, domain }) {
  if (!Array.isArray(addresses) || !local || !domain) return null;
  const localLc = local.toLowerCase();
  const domainLc = domain.toLowerCase();
  for (const addr of addresses) {
    if (!addr || typeof addr !== "string") continue;
    const at = addr.lastIndexOf("@");
    if (at < 0) continue;
    const localPart = addr.slice(0, at).toLowerCase();
    const domainPart = addr.slice(at + 1).toLowerCase();
    if (domainPart !== domainLc) continue;
    const plus = localPart.indexOf("+");
    if (plus < 0) continue;
    if (localPart.slice(0, plus) !== localLc) continue;
    const token = addr.slice(plus + 1, at); // verbatim case from original
    if (token) return token;
  }
  return null;
}

// Markers that begin the quoted history / signature in a reply. We keep only
// the text BEFORE the earliest marker. Heuristic, tuned for the common clients
// (Gmail, Apple Mail, Outlook). Better to over-keep than to drop the message.
const QUOTE_MARKERS = [
  /^>/, // a quoted line
  /^on .+wrote:\s*$/i, // Gmail/Apple single-line "On <date> X wrote:"
  /\bwrote:\s*$/i, // wrapped "...\n<name> wrote:"
  /^-{2,}\s*original message\s*-{2,}/i, // Outlook
  /^_{5,}\s*$/, // Outlook divider rule
  /^from:\s.+/i, // Outlook inline header block
  /^sent from my /i, // mobile signature
  /^get outlook for /i,
  /^--\s*$/, // standard signature delimiter
];

export function stripQuotedReply(text) {
  if (!text || typeof text !== "string") return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (QUOTE_MARKERS.some((re) => re.test(line))) {
      cut = i;
      break;
    }
  }
  const kept = lines.slice(0, cut).join("\n").trim();
  // If stripping ate everything (e.g. a top-quoted reply with no new text),
  // fall back to the full trimmed body so we never silently drop content.
  return kept || text.trim();
}

// True when the message looks machine-generated (vacation responder, bounce,
// list mail) and shouldn't be threaded as a real guest reply. `headers` is a
// mailparser Headers Map (case-insensitive keys) or a plain object.
export function isAutoReply(headers) {
  const get = (k) => {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(k);
    return headers[k] ?? headers[k?.toLowerCase?.()] ?? null;
  };
  const autoSubmitted = String(get("auto-submitted") || "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;

  const precedence = String(get("precedence") || "").toLowerCase();
  if (["bulk", "auto_reply", "junk", "list"].includes(precedence)) return true;

  if (get("x-autoreply") || get("x-autorespond") || get("x-auto-response-suppress")) {
    return true;
  }
  // Mailer-daemon / no-reply senders aren't real replies either.
  const from = String(get("from") || "").toLowerCase();
  if (/mailer-daemon|no-?reply|do-?not-?reply|postmaster/.test(from)) return true;

  return false;
}
