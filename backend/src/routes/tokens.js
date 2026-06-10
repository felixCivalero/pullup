// Personal access tokens (PATs) for the PullUp MCP server + CLI clients:
// mint/list/revoke, plus the /host/mcp/status connection check.

import {
  createPersonalAccessToken,
  listPersonalAccessTokensForUser,
  revokePersonalAccessToken,
} from "../data.js";
import { requireAuth } from "../middleware/auth.js";

// ---------------------------
// PROTECTED: Personal Access Tokens (PATs)
// ---------------------------
// Tokens are issued from a logged-in browser session and used by clients
// that can't run a browser-based Supabase flow (the PullUp MCP server, CLI
// scripts, etc.). Plaintext is returned ONCE at mint time and never again.
//
// Mint/list/revoke require a Supabase JWT (req.authType === "jwt"), not a
// PAT, so a stolen PAT can't escalate by spawning more PATs.
function requireJwtAuth(req, res, next) {
  if (req.authType !== "jwt") {
    return res.status(403).json({
      error: "forbidden",
      message: "Token management requires a browser session, not a PAT.",
    });
  }
  next();
}

export function registerTokenRoutes(app) {
  app.post("/host/tokens", requireAuth, requireJwtAuth, async (req, res) => {
    try {
      const { name, expiresInDays } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: "name_required", message: "name is required" });
      }
      const days = expiresInDays != null ? Number(expiresInDays) : null;
      if (days != null && (!Number.isFinite(days) || days <= 0 || days > 3650)) {
        return res.status(400).json({
          error: "invalid_expires_in_days",
          message: "expiresInDays must be a positive number ≤ 3650.",
        });
      }
      const created = await createPersonalAccessToken({
        userId: req.user.id,
        name,
        expiresInDays: days,
      });
      // Plaintext is in `token` — surface it to the user immediately. We never
      // store it and can't recover it later.
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating PAT:", error);
      res.status(500).json({ error: "Failed to create token" });
    }
  });

  // GET /host/mcp/status — does this host have an MCP connection live?
  // Used by the floating PullUp widget to decide between the "Connect MCP"
  // promo and the "PullUp · N" coach pill. Cheap: counts active (not
  // revoked, not expired) PATs — both manual and OAuth flows mint PATs, so
  // one query covers both connection paths.
  app.get("/host/mcp/status", requireAuth, async (req, res) => {
    try {
      const { listPersonalAccessTokensForUser } = await import("../data.js");
      const tokens = await listPersonalAccessTokensForUser(req.user.id);
      const now = Date.now();
      const active = tokens.filter((t) => {
        if (t.revokedAt) return false;
        if (t.expiresAt && new Date(t.expiresAt).getTime() <= now) return false;
        return true;
      });
      const lastUsedAt = active
        .map((t) => t.lastUsedAt)
        .filter(Boolean)
        .sort()
        .pop() || null;
      res.json({
        connected: active.length > 0,
        activeCount: active.length,
        lastUsedAt,
      });
    } catch (err) {
      console.error("Error in /host/mcp/status:", err);
      res.status(500).json({ error: "Failed to read MCP status" });
    }
  });

  app.get("/host/tokens", requireAuth, requireJwtAuth, async (req, res) => {
    try {
      const tokens = await listPersonalAccessTokensForUser(req.user.id);
      res.json(tokens);
    } catch (error) {
      console.error("Error listing PATs:", error);
      res.status(500).json({ error: "Failed to list tokens" });
    }
  });

  app.delete("/host/tokens/:id", requireAuth, requireJwtAuth, async (req, res) => {
    try {
      const ok = await revokePersonalAccessToken({ userId: req.user.id, tokenId: req.params.id });
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ revoked: true });
    } catch (error) {
      console.error("Error revoking PAT:", error);
      res.status(500).json({ error: "Failed to revoke token" });
    }
  });
}
