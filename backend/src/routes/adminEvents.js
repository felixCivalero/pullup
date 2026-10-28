// The organiser side of the event platform: your events, create/edit, the
// guest list, the CRM of everyone who signed up to you, and mail to them.
// Any signed-in person is an organiser of their own events; the owner sees
// every event on PullUp. The work is in repos/hostEvents.js — the same
// functions an assistant runs through actions/ — so these routes only map
// HTTP to it. Mail to a list is paid (lib/emailCredits.js).
import crypto from "crypto";
import { requireUser } from "../middleware/requireUser.js";
import { supabase } from "../supabase.js";
import { EVENT_IMAGE_BUCKET, imageUrl } from "../lib/eventPlatform.js";
import { ActionError, statusFor } from "../lib/actionError.js";
import { loadEventMedia } from "./adminEventMedia.js";
import {
  createEvent, eventWithGuests, listEvents, listPeople, listSends, previewSend, sendMail, updateEvent, updateGuest,
} from "../repos/hostEvents.js";
import { brandScope, brandShape, createBrand, renameBrand } from "../lib/brands.js";
import { over } from "../lib/abuse.js";
import {
  acceptInvite, brandTeam, cancelInvite, declineInvite, eventTeam, inviteToBrand, inviteToEvent, removeCohost, removeMember,
} from "../lib/teams.js";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// requireUser, then the handler; its result is the JSON answer. An
// ActionError answers with its status and { error, ...extra } (the shape the
// admin pages already read: 402 carries needed/balance, 400 a detail).
export function handle(fn, okStatus = 200) {
  return [
    requireUser,
    async (req, res) => {
      try {
        const out = await fn(req, res);
        if (res.headersSent) return undefined;
        return res.status(okStatus).json(out);
      } catch (err) {
        if (err instanceof ActionError) return res.status(statusFor(err.code)).json({ error: err.code, message: err.message, ...err.extra });
        console.error(`[admin/events] ${req.method} ${req.path}:`, err?.message);
        return res.status(500).json({ error: "failed" });
      }
    },
  ];
}

export function registerAdminEventRoutes(app) {
  // The account's brands and the one this page works in (lib/brands.js).
  app.get("/admin/brands", ...handle(async (req) => {
    const { brands, brand } = await brandScope(req.caller);
    return { brands: brands.map(brandShape), current: brand?.id || null };
  }));

  app.post("/admin/brands", ...handle(async (req) => ({ brand: await createBrand(req.caller, req.body?.name) }), 201));

  app.patch("/admin/brands/:id", ...handle(async (req) => ({ brand: await renameBrand(req.caller, req.params.id, req.body?.name) })));

  // Working together (lib/teams.js): the brand's team, one event's co-hosts,
  // and the invites waiting for the signed-in address.
  app.get("/admin/team", ...handle(async (req) => brandTeam(req.caller)));

  app.post("/admin/team/invites", ...handle(async (req) => inviteToBrand(req.caller, req.body?.email), 201));

  app.delete("/admin/team/members/:userId", ...handle(async (req) => removeMember(req.caller, req.params.userId)));

  app.get("/admin/events/:id/team", ...handle(async (req) => eventTeam(req.caller, req.params.id)));

  app.post("/admin/events/:id/team", ...handle(async (req) => inviteToEvent(req.caller, req.params.id, req.body?.email), 201));

  app.delete("/admin/events/:id/team/:userId", ...handle(async (req) => removeCohost(req.caller, req.params.id, req.params.userId)));

  app.delete("/admin/invites/:id", ...handle(async (req) => cancelInvite(req.caller, req.params.id)));

  app.post("/admin/invites/:id/accept", ...handle(async (req) => acceptInvite(req.caller, req.params.id)));

  app.post("/admin/invites/:id/decline", ...handle(async (req) => declineInvite(req.caller, req.params.id)));

  app.get("/admin/events", ...handle(async (req) => ({ events: await listEvents(req.caller) })));

  app.post("/admin/events", ...handle(async (req) => ({ event: await createEvent(req.caller, req.body) }), 201));

  app.get("/admin/events/:id", ...handle(async (req) => {
    const out = await eventWithGuests(req.caller, req.params.id);
    return { ...out, media: await loadEventMedia(out.event.id) };
  }));

  app.patch("/admin/events/:id", ...handle(async (req) => ({ event: await updateEvent(req.caller, req.params.id, req.body) })));

  app.patch("/admin/rsvps/:id", ...handle(async (req) => ({ rsvp: await updateGuest(req.caller, req.params.id, req.body) })));

  // Signed upload URL: the browser uploads the cover straight to Storage.
  app.post("/admin/events/upload-url", ...handle(async (req) => {
    if (over(`upload:${req.caller.userId}`, 120, 3600_000)) throw new ActionError("rate_limited", "Too many uploads in a short time. Wait a while.");
    const ext = EXT[req.body?.mimeType] || "jpg";
    const path = `admin/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error || new Error("upload_url_failed");
    return { bucket: EVENT_IMAGE_BUCKET, path, token: data.token, publicUrl: imageUrl(path, process.env.SUPABASE_URL) };
  }));

  app.get("/admin/people", ...handle(async (req) => listPeople(req.caller)));

  // How many a send would reach, before sending.
  app.post("/admin/sends/preview", ...handle(async (req) => previewSend(req.caller, req.body?.audience)));

  // Send (202: it goes out in the background). `test: true` = one copy to you.
  app.post("/admin/sends", ...handle(async (req) => sendMail(req.caller, req.body), 202));

  app.get("/admin/sends", ...handle(async (req) => ({ sends: await listSends(req.caller) })));
}
