// Resend's delivery events for the mail we send (routes/adminEvents.js
// deliver()). Each event finds its email_outbox row by Resend's email id and
// moves it on (sent → delivered / bounced / complaint). A complaint or a
// permanent bounce puts the address in email_suppressions, and sends skip
// suppressed addresses, so a dead address never takes a paid send again.
// Resend signs with Svix over the exact bytes: raw body, mounted before the
// global JSON parser (see index.js).
import express from "express";
import { Resend } from "resend";
import { supabase } from "../supabase.js";

const WEBHOOK_PATH = "/webhooks/resend-events";
export const resendEventsParser = [WEBHOOK_PATH, express.raw({ type: "application/json", limit: "1mb" })];

const SECRET = process.env.RESEND_EVENTS_WEBHOOK_SIGNING_SECRET || process.env.RESEND_WEBHOOK_SIGNING_SECRET || null;
// Resend event → the outbox row's status. Opens/clicks don't change it.
const STATUS = { "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complaint" };
// A row only moves forward: a late "delivered" never undoes a bounce.
const RANK = { queued: 0, sending: 0, sent: 1, delivered: 2, bounced: 3, complaint: 3, failed: 3 };

function verify(req) {
  const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
  if (!SECRET) {
    if (process.env.NODE_ENV === "production") return null;
    return JSON.parse(payload || "{}");
  }
  return new Resend(process.env.RESEND_API_KEY).webhooks.verify({
    payload,
    webhookSecret: SECRET,
    headers: { id: req.headers["svix-id"], timestamp: req.headers["svix-timestamp"], signature: req.headers["svix-signature"] },
  });
}

async function suppress(email, reason, details) {
  const { error } = await supabase
    .from("email_suppressions")
    .upsert({ email: email.trim().toLowerCase(), reason, source: "resend", details, updated_at: new Date().toISOString() }, { onConflict: "email" });
  if (error) console.error("[resend-events] suppression failed:", error.message);
}

export function registerResendEventRoutes(app) {
  app.post(WEBHOOK_PATH, async (req, res) => {
    let event;
    try {
      event = verify(req);
    } catch {
      return res.status(403).json({ error: "bad_signature" });
    }
    if (!event) return res.status(503).json({ error: "signing_secret_missing" });

    const status = STATUS[event.type];
    if (!status) return res.json({ ok: true, ignored: event.type || "unknown" });
    const data = event.data || {};
    const recipient = (Array.isArray(data.to) ? data.to[0] : data.to) || null;

    try {
      if (data.email_id) {
        const { data: row } = await supabase.from("email_outbox").select("id, status").eq("provider_message_id", data.email_id).maybeSingle();
        if (row && (RANK[status] ?? 0) > (RANK[row.status] ?? 0)) {
          await supabase.from("email_outbox").update({
            status,
            updated_at: new Date().toISOString(),
            ...(status === "bounced" ? { last_error_message: String(data.bounce?.message || data.bounce?.subType || "bounced").slice(0, 300) } : {}),
          }).eq("id", row.id);
        }
      }
      // Complaints always; bounces only when Resend calls them permanent, so
      // one bad night at a mail host never silences a real guest.
      if (recipient && status === "complaint") await suppress(recipient, "complaint", data);
      if (recipient && status === "bounced" && String(data.bounce?.type || "").toLowerCase() === "permanent") {
        await suppress(recipient, "hard_bounce", data);
      }
      return res.json({ ok: true, type: event.type });
    } catch (err) {
      console.error("[resend-events] failed:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
