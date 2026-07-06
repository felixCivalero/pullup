// Routes: unified early-access requests — Instagram, Agency tier, Products.
// One table (access_requests), one loop: the request row + the host's PullUp
// system thread (an access_request log line, then PullUp greets so the thread
// is born alive). NO email is involved anywhere — the admin dashboard's
// System inbox is both the notification and the reply surface.
//
//   GET  /host/access-requests/:kind — "have I asked?" for the surface's state
//   POST /host/access-requests/:kind — raise a hand; re-submitting updates
//
// Requests are open to any signed-in host, deliberately unpaywalled: asking
// for access is interest, not hosting — and the PullUp thread it opens is the
// one conversation that must never be behind the subscription.

import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../supabase.js";
import { getSystemPersonId } from "../repos/systemPerson.js";
import { logPersonEvent } from "../services/personTimeline.js";

const KINDS = {
  instagram: {
    requiresHandle: true,
    logLine: (p) => `Requested Instagram early access — @${p.igHandle}${p.note ? `\n${p.note}` : ""}`,
    greeting:
      "Got your Instagram request — Felix will reply to you right here once your account is added as a tester.",
  },
  agency: {
    logLine: (p) => `Requested Agency tier early access${p.note ? `\n${p.note}` : ""}`,
    greeting: "Got your Agency request — Felix will reply to you right here.",
  },
  product: {
    logLine: (p) => `Requested Products early access${p.note ? `\n${p.note}` : ""}`,
    greeting: "Got your Products request — Felix will reply to you right here.",
  },
};

const clean = (v, max) => String(v || "").trim().slice(0, max) || null;

export function registerAccessRequestRoutes(app) {
  app.get("/host/access-requests/:kind", requireAuth, async (req, res) => {
    try {
      const { kind } = req.params;
      if (!KINDS[kind]) return res.status(400).json({ error: "unknown_kind" });
      const { data } = await supabase
        .from("access_requests")
        .select("kind, payload, status, created_at, updated_at")
        .eq("host_id", req.user.id)
        .eq("kind", kind)
        .maybeSingle();
      res.json({ requested: !!data, request: data || null });
    } catch (e) {
      console.error("[access-requests] status failed:", e?.message);
      res.json({ requested: false, request: null }); // cosmetic read — fail soft
    }
  });

  app.post("/host/access-requests/:kind", requireAuth, async (req, res) => {
    try {
      const { kind } = req.params;
      const spec = KINDS[kind];
      if (!spec) return res.status(400).json({ error: "unknown_kind" });

      const payload = {};
      const igHandle = clean(req.body?.igHandle, 80)?.replace(/^@+/, "") || null;
      const email = clean(req.body?.email, 200);
      const name = clean(req.body?.name, 200);
      const note = clean(req.body?.note, 1000);
      if (igHandle) payload.igHandle = igHandle;
      if (email) payload.email = email;
      if (name) payload.name = name;
      if (note) payload.note = note;
      if (spec.requiresHandle && !igHandle) {
        return res.status(400).json({ error: "igHandle is required" });
      }

      const { error } = await supabase.from("access_requests").upsert(
        { host_id: req.user.id, kind, payload, status: "pending", updated_at: new Date().toISOString() },
        { onConflict: "host_id,kind" },
      );
      if (error) throw error;

      // The system chat: PullUp becomes a contact in the REQUESTER's Messages
      // (eyes avatar, Official). The request is the ✦ log line; PullUp greets
      // so the thread is born alive. The admin System inbox flags it needsReply
      // — that IS the notification; no email rides along.
      try {
        const systemPersonId = await getSystemPersonId();
        if (systemPersonId) {
          await logPersonEvent({
            personId: systemPersonId,
            hostId: req.user.id,
            type: "access_request",
            channel: "email",
            body: spec.logLine(payload),
            metadata: { source: "access_request", kind },
          });
          await logPersonEvent({
            personId: systemPersonId,
            hostId: req.user.id,
            type: "message_in",
            channel: "email",
            direction: "in",
            body: spec.greeting,
            metadata: { source: "system_auto" },
          });
        }
      } catch (e) {
        console.error("[access-requests] system thread failed (non-blocking):", e?.message);
      }

      res.json({ ok: true, requested: true });
    } catch (e) {
      console.error("[access-requests] request failed:", e?.message);
      res.status(500).json({ error: "request_failed" });
    }
  });
}
