// Digital-product delivery — two surfaces, one trust boundary.
//
//   1. HOST mints a signed upload URL into the PRIVATE `product-downloads`
//      bucket (auth + canEditEvent). The browser PUTs the file straight to
//      Storage; the host saves the returned path into events.fulfillment.download.
//   2. BUYER fetches their delivery AFTER paying. The gate verifies the RSVP is
//      settled (paymentStatus=paid && bookingStatus=CONFIRMED) before minting a
//      time-boxed signed download URL / revealing the secret / unlocking the
//      protected content. Secrets live only in events.fulfillment (host-only);
//      they reach a buyer ONLY through this gate, never the public page payload.

import { findEventById, findRsvpById, canEditEvent } from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { extensionFromMime } from "../lib/uploads.js";

const DOWNLOAD_BUCKET = "product-downloads";
const DOWNLOAD_TTL_SECONDS = 60 * 60 * 24; // 24h — fresh link each time the buyer opens delivery

export function registerProductDeliveryRoutes(app) {
  // ---------------------------
  // PROTECTED: mint a signed upload URL for a product's deliverable file.
  // Server controls the path (bound under the event folder in the PRIVATE
  // bucket) so the file is never world-readable — only the gated buyer endpoint
  // can mint a read URL for it.
  // ---------------------------
  app.post("/host/events/:eventId/product-asset/upload-url", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { mimeType, filename } = req.body || {};

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const allowed = await canEditEvent(req.user.id, eventId);
      if (!allowed) return res.status(403).json({ error: "Forbidden" });

      const ext = extensionFromMime(mimeType) || "bin";
      const path = `${eventId}/asset_${Date.now()}.${ext}`;

      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase.storage
        .from(DOWNLOAD_BUCKET)
        .createSignedUploadUrl(path);
      if (error || !data) {
        console.error("[product-asset] createSignedUploadUrl failed", error);
        return res.status(500).json({ error: "Could not mint upload URL" });
      }

      res.json({
        path,
        token: data.token,
        uploadUrl: data.signedUrl,
        filename: filename || null,
        mime: mimeType || null,
      });
    } catch (err) {
      console.error("[product-asset/upload-url] error", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // ---------------------------
  // PUBLIC (UUID-gated): a buyer's delivery, served only after settlement.
  // rsvpId is an unguessable UUID and we re-check the paid state on every call —
  // the same trust model as /payments/:paymentId/status. Returns the live
  // signed download URL, the revealed secret, and any protected content.
  // ---------------------------
  app.get("/public/rsvps/:rsvpId/delivery", async (req, res) => {
    try {
      const { rsvpId } = req.params;
      const rsvp = await findRsvpById(rsvpId);
      if (!rsvp) return res.status(404).json({ error: "not_found" });

      // THE gate — both fields are flipped together by settlement on success.
      const paid = rsvp.paymentStatus === "paid" && rsvp.bookingStatus === "CONFIRMED";
      if (!paid) return res.status(403).json({ error: "not_paid" });

      const event = await findEventById(rsvp.eventId);
      const f = event?.fulfillment && typeof event.fulfillment === "object" ? event.fulfillment : null;
      if (!f) return res.json({ delivery: null });

      const delivery = {};

      if (f.download?.enabled && f.download.path) {
        const { supabase } = await import("../supabase.js");
        const { data, error } = await supabase.storage
          .from(DOWNLOAD_BUCKET)
          .createSignedUrl(f.download.path, DOWNLOAD_TTL_SECONDS, {
            download: f.download.filename || true,
          });
        if (!error && data?.signedUrl) {
          delivery.download = { url: data.signedUrl, filename: f.download.filename || null };
        }
      }

      if (f.secret?.enabled && f.secret.value) {
        delivery.secret = { kind: f.secret.kind || "link", value: f.secret.value };
      }

      if (f.unlock?.enabled && (f.unlock.body || f.unlock.title)) {
        delivery.unlock = { title: f.unlock.title || "Members-only", body: f.unlock.body || "" };
      }

      res.json({ delivery });
    } catch (err) {
      console.error("[product delivery] error", err);
      res.status(500).json({ error: "Internal error" });
    }
  });
}
