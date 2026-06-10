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
