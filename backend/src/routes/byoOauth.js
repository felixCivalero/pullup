// backend/src/routes/byoOauth.js
//
// The keyless "Connect with Supabase" flow (BYO increment 4). Three steps:
//   start    — (authed) returns the authorize URL; the frontend redirects to it
//   callback — (no session; authed by the signed `state`) Supabase redirects
//              here with the code → exchange it, create the creator's project,
//              redirect them back to the app. Heavy work deferred to finalize.
//   finalize — (authed) poll: once the project is ACTIVE_HEALTHY, fetch its
//              service key, provision the owned schema, mark connected.
//
// Project creation is async on Supabase's side (~1-2 min), so we never block a
// request on it — the browser bounces straight back and the UI polls finalize.
// All inert until BYO_SUPABASE_ENABLED + the OAuth app is configured.

import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { byoEnabled, byoEnabledForHost, byoOauthConfigured } from "../config/byo.js";
import { getFrontendUrl } from "../lib/urls.js";
import {
  genPkce, signState, verifyState, buildAuthorizeUrl, exchangeCode,
} from "../services/byo/supabaseOauth.js";
import {
  listOrganizations, createOrganization, createProject, getProject, getProjectServiceKey, deleteProject,
} from "../services/byo/managementApi.js";
import {
  beginOauthConnection, attachServiceKey, getCreatorDatabaseWithKey,
  setCreatorDatabaseStatus,
} from "../repos/creatorDatabases.js";
import { decryptSecret } from "../utils/encryption.js";
import { provisionOwnedProject } from "../services/byo/provisioner.js";

const DEFAULT_REGION = process.env.BYO_DEFAULT_REGION || "eu-central-1";

export function registerByoOauthRoutes(app) {
  // 1) START — authed fetch returns the authorize URL (anchor nav can't carry
  //    the bearer token, so the frontend does window.location = url).
  app.get("/host/byo/oauth/start", requireAuth, async (req, res) => {
    if (!byoEnabledForHost(req.user.id) || !byoOauthConfigured()) {
      return res.status(503).json({ error: "oauth_unavailable" });
    }
    const { verifier, challenge } = genPkce();
    const state = signState({ hostId: req.user.id, verifier });
    return res.json({ url: buildAuthorizeUrl(state, challenge) });
  });

  // 2) CALLBACK — Supabase redirects the browser here (no session). The signed
  //    state authenticates the user + carries the PKCE verifier.
  app.get("/host/byo/oauth/callback", async (req, res) => {
    const back = (q) => res.redirect(`${getFrontendUrl().replace(/\/$/, "")}/settings?byo=${q}`);
    if (!byoEnabled() || !byoOauthConfigured()) return back("disabled");

    const st = verifyState(req.query.state);
    if (!st || !req.query.code) return back("badstate");
    const hostId = st.hostId;
    if (!byoEnabledForHost(hostId)) return back("disabled");

    try {
      const tokens = await exchangeCode({ code: req.query.code, verifier: st.verifier });
      const mgmtToken = tokens.access_token;

      const orgs = await listOrganizations(mgmtToken);
      let orgId = orgs[0]?.id || null;
      if (!orgId) {
        // Brand-new Supabase user with no org yet (the "I don't have an account"
        // path) — create their first org so setup completes in one shot. If the
        // OAuth token isn't scoped to create orgs, fall back to a friendly notice.
        try {
          const org = await createOrganization(mgmtToken, { name: `pullup-${hostId.slice(0, 8)}` });
          orgId = org?.id || null;
        } catch (e) {
          console.error("[byo oauth] org auto-create failed:", e?.message);
        }
      }
      if (!orgId) return back("noorg");

      const dbPass = crypto.randomBytes(18).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
      const project = await createProject(mgmtToken, {
        orgId, name: `pullup-${hostId.slice(0, 8)}`, region: DEFAULT_REGION, dbPass,
      });
      const ref = project.id || project.ref;
      if (!ref) return back("nocreate");

      await beginOauthConnection({
        hostId, projectRef: ref, dbUrl: `https://${ref}.supabase.co`, mgmtToken,
      });
      // project is COMING_UP — the UI polls finalize from here.
      return back("provisioning");
    } catch (e) {
      console.error("[byo oauth] callback failed:", e?.message);
      try { await setCreatorDatabaseStatus(hostId, "error", { last_error: e.message }); } catch { /* */ }
      return back("error");
    }
  });

  // 3) FINALIZE — poll until the project is healthy, then fetch its key +
  //    provision. Returns { ready, status }. The UI calls this on a timer while
  //    status is 'provisioning'.
  app.post("/host/byo/oauth/finalize", requireAuth, async (req, res) => {
    if (!byoEnabledForHost(req.user.id)) return res.status(503).json({ error: "byo_disabled" });
    try {
      const row = await getCreatorDatabaseWithKey(req.user.id);
      if (!row || !row.project_ref || !row.encrypted_mgmt_token) {
        return res.status(409).json({ ready: false, status: "not_connected" });
      }
      const mgmtToken = decryptSecret(row.encrypted_mgmt_token);
      const project = await getProject(mgmtToken, row.project_ref);
      if (project.status !== "ACTIVE_HEALTHY") {
        return res.json({ ready: false, status: project.status || "coming_up" });
      }

      // healthy → fetch the service key (if we haven't yet) + provision.
      if (!row.encrypted_service_key) {
        const sk = await getProjectServiceKey(mgmtToken, row.project_ref);
        if (!sk) return res.status(502).json({ ready: false, status: "no_service_key" });
        await attachServiceKey(req.user.id, sk);
      }
      const pr = await provisionOwnedProject(req.user.id);
      if (!pr.ok) return res.status(409).json({ ready: false, status: "provision_failed", reason: pr.reason });
      return res.json({ ready: true, status: "connected", schemaVersion: pr.schemaVersion });
    } catch (e) {
      console.error("[byo oauth] finalize failed:", e?.message);
      return res.status(500).json({ ready: false, status: "error" });
    }
  });

  // Abandon: tear down a half-created project (test cleanup / user backs out).
  app.post("/host/byo/oauth/abandon", requireAuth, async (req, res) => {
    if (!byoEnabledForHost(req.user.id)) return res.status(503).json({ error: "byo_disabled" });
    try {
      const row = await getCreatorDatabaseWithKey(req.user.id);
      if (row?.project_ref && row?.encrypted_mgmt_token) {
        try { await deleteProject(decryptSecret(row.encrypted_mgmt_token), row.project_ref); } catch { /* */ }
      }
      await setCreatorDatabaseStatus(req.user.id, "revoked", { encrypted_service_key: "", encrypted_mgmt_token: null });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "abandon_failed" });
    }
  });
}
