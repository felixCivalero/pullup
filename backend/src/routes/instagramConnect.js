// Routes: host Instagram account connect/manage — per-host IG OAuth (start/callback),
// connection status, multi-account management, and connected-account media listing.

import { requireAuth } from "../middleware/auth.js";
import {
  startInstagramConnect,
  instagramConnectCallback,
  getInstagramConnectionStatus,
  getInstagramConnectUrl,
  setDefaultInstagramAccount,
  updateInstagramAccount,
  disconnectInstagramAccount,
} from "../instagram/oauth/connectRoutes.js";

export function registerInstagramConnectRoutes(app) {
  // ---------------------------
  // INSTAGRAM CONNECT (per-host OAuth — PullUp as client to Meta)
  // ---------------------------
  // start = redirect host to IG authorize (authed); callback = store the
  // connection; status = Settings UI state.
  app.get("/oauth/instagram/start", requireAuth, startInstagramConnect);
  app.get("/oauth/instagram/callback", instagramConnectCallback);
  app.get("/instagram/connection", requireAuth, getInstagramConnectionStatus);
  app.get("/instagram/connect-url", requireAuth, getInstagramConnectUrl);
  // Multi-account management — set the reply-from default, rename, disconnect.
  app.post("/instagram/connections/:id/default", requireAuth, setDefaultInstagramAccount);
  app.patch("/instagram/connections/:id", requireAuth, updateInstagramAccount);
  app.delete("/instagram/connections/:id", requireAuth, disconnectInstagramAccount);

  // ---------------------------
  // EARLY ACCESS — while Meta reviews the app, only internal testers can
  // connect. Hosts request access here with the info needed to add them in
  // the Meta app (IG handle + contact); re-submitting updates their row.
  // ---------------------------
  app.get("/instagram/early-access", requireAuth, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { data } = await supabase
        .from("ig_access_requests")
        .select("ig_handle, email, name, status, created_at")
        .eq("host_id", req.user.id)
        .maybeSingle();
      res.json({ requested: !!data, request: data || null });
    } catch (e) {
      console.error("[ig-early-access] status failed:", e?.message);
      res.json({ requested: false, request: null }); // cosmetic read — fail soft
    }
  });

  app.post("/instagram/early-access", requireAuth, async (req, res) => {
    try {
      // Early access is a CREATOR-tier perk: the concierge loop (Felix
      // replying by email, landing in their PullUp Messages) only makes sense
      // for someone who can actually host. Founders pass free, as always.
      const { getEntitlement } = await import("../services/billing/entitlements.js");
      const ent = await getEntitlement(req.user.id);
      if (!ent.canHost) {
        return res.status(402).json({ error: "subscription_required", paywall: true });
      }

      const igHandle = String(req.body?.igHandle || "").trim().replace(/^@+/, "").slice(0, 80);
      const email = String(req.body?.email || "").trim().slice(0, 200) || null;
      const name = String(req.body?.name || "").trim().slice(0, 200) || null;
      const note = String(req.body?.note || "").trim().slice(0, 1000) || null;
      if (!igHandle) return res.status(400).json({ error: "igHandle is required" });

      const { supabase } = await import("../supabase.js");
      const { error } = await supabase.from("ig_access_requests").upsert(
        { host_id: req.user.id, ig_handle: igHandle, email, name, note, status: "pending", updated_at: new Date().toISOString() },
        { onConflict: "host_id" },
      );
      if (error) throw error;

      // The system chat: PullUp becomes a contact in the REQUESTER's Messages
      // (eyes avatar, Official). The request is the ✦ log line; PullUp greets
      // so the thread is born alive. Internal rows — the admin dashboard's
      // System inbox answers here; no email is involved in the conversation.
      const requesterEmail = email || req.user.email || null;
      try {
        const { getSystemPersonId } = await import("../repos/systemPerson.js");
        const systemPersonId = await getSystemPersonId();
        if (systemPersonId) {
          const { logPersonEvent } = await import("../services/personTimeline.js");
          await logPersonEvent({
            personId: systemPersonId,
            hostId: req.user.id,
            type: "access_request",
            channel: "email",
            body: `Requested Instagram early access — @${igHandle}${note ? `\n${note}` : ""}`,
            metadata: { source: "ig_early_access", igHandle },
          });
          await logPersonEvent({
            personId: systemPersonId,
            hostId: req.user.id,
            type: "message_in",
            channel: "email",
            direction: "in",
            body: "Got your Instagram request — Felix will reply to you right here once your account is added as a tester.",
            metadata: { source: "system_auto" },
          });
        }
      } catch (e) {
        console.error("[ig-early-access] system thread failed (non-blocking):", e?.message);
      }

      // Plain heads-up ping to the shared mailbox (NOT the conversation — the
      // admin dashboard's System inbox is where the reply happens).
      try {
        const { sendEmail } = await import("../services/emailService.js");
        await sendEmail({
          to: "hello@pullup.se",
          subject: `IG early access request: @${igHandle}`,
          text: [
            `Instagram early-access request`,
            ``,
            `IG handle: @${igHandle}`,
            `Name: ${name || "—"}`,
            `Email: ${requesterEmail || "—"}`,
            `Note: ${note || "—"}`,
            `Tier: ${ent.plan}${ent.reason === "early" ? " (founding)" : ""}`,
            ``,
            `Add them as an internal tester in the Meta app.`,
            `Reply from the admin dashboard → System inbox: https://pullup.se/admin`,
          ].join("\n"),
        });
      } catch (e) {
        console.error("[ig-early-access] notify email failed:", e?.message);
      }

      res.json({ ok: true, requested: true });
    } catch (e) {
      console.error("[ig-early-access] request failed:", e?.message);
      res.status(500).json({ error: "request_failed" });
    }
  });

  // GET /instagram/media — the connected account's posts for the comment-trigger
  // post picker. Cursor-paginated: pass ?after=<cursor> to page back through the
  // whole catalog. `sandbox` lets the UI say "these are placeholders, real posts
  // show on the live site". Empty list if not connected.
  app.get("/instagram/media", requireAuth, async (req, res) => {
    try {
      const { IG_SANDBOX_MODE } = await import("../instagram/config.js");
      const { getConnectionForHost, getCredentialsByIgUserId } = await import(
        "../instagram/repos/instagramConnectionsRepo.js"
      );
      const conn = await getConnectionForHost(req.user.id);
      const creds = conn?.ig_user_id ? await getCredentialsByIgUserId(conn.ig_user_id) : null;
      if (!creds?.accessToken) {
        return res.json({ ok: true, connected: false, sandbox: IG_SANDBOX_MODE, media: [], nextCursor: null });
      }
      const { fetchRecentMedia } = await import("../instagram/providers/igGraphClient.js");
      const after = typeof req.query.after === "string" ? req.query.after : null;
      const { media, nextCursor } = await fetchRecentMedia({ accessToken: creds.accessToken, after });
      res.json({ ok: true, connected: true, sandbox: IG_SANDBOX_MODE, media, nextCursor });
    } catch (e) {
      console.error("[instagram/media]", e.message);
      res.status(500).json({ ok: false, error: "media_failed", media: [], nextCursor: null });
    }
  });
}
