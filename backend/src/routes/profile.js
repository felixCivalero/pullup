// Host profile routes (GET/PUT /host/profile) + Stripe Connect onboarding
// (initiate/status/disconnect). Extracted verbatim from index.js.

import { getUserProfile, updateUserProfile } from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import {
  initiateConnectOnboarding,
  getConnectedAccountStatus,
  disconnectStripeAccount,
} from "../stripeConnect.js";
import { emitIntent, sourceFromRequest } from "../services/intentLog.js";

export function registerProfileRoutes(app) {
  // ---------------------------
  // PROTECTED: Get user profile
  // ---------------------------
  app.get("/host/profile", requireAuth, async (req, res) => {
    try {
      const profile = await getUserProfile(req.user.id);
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // ---------------------------
  // PROTECTED: Update user profile
  // ---------------------------
  app.put("/host/profile", requireAuth, async (req, res) => {
    try {
      // Ensure the profile row exists. updateUserProfile is plain UPDATE — for
      // a brand-new user finishing onboarding, the row may not have been
      // lazy-created yet, which would silently no-op the save. getUserProfile
      // creates the default row if missing AND back-links any matching
      // sales_leads by email at the same time.
      await getUserProfile(req.user.id);
      const updates = req.body || {};
      // Defense in depth: a blank/whitespace name must never overwrite an
      // identity (onboarding once clobbered real profiles this way). Drop it so
      // a stray empty name silently no-ops instead of wiping the display name.
      if (typeof updates.name === "string" && !updates.name.trim()) {
        delete updates.name;
      }
      const updated = await updateUserProfile(req.user.id, updates);

      // host_brief changes are the one profile field with a dedicated MCP tool
      // (set_host_brief), so log them distinctly. Other profile edits aren't
      // mirrored in MCP today; emit them under update_profile for completeness.
      if (Object.prototype.hasOwnProperty.call(updates || {}, "hostBrief")) {
        emitIntent({
          hostId: req.user.id,
          tool: "set_host_brief",
          args: { brief: updates.hostBrief },
          source: sourceFromRequest(req),
          target: { type: "profile", id: req.user.id },
          result: { length: (updates.hostBrief || "").length },
        });
      } else {
        emitIntent({
          hostId: req.user.id,
          tool: "update_profile",
          args: Object.keys(updates || {}).reduce((acc, k) => {
            // Don't log raw image data or sensitive fields verbatim.
            if (k === "avatarUrl" || k === "logoUrl") acc[k] = updates[k];
            else if (typeof updates[k] !== "string" || updates[k].length < 500) acc[k] = updates[k];
            return acc;
          }, {}),
          source: sourceFromRequest(req),
          target: { type: "profile", id: req.user.id },
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // ---------------------------
  // STRIPE CONNECT: Initiate onboarding via Account Links
  // ---------------------------
  app.post("/host/stripe/connect/initiate", requireAuth, async (req, res) => {
    try {
      const result = await initiateConnectOnboarding(req.user.id);

      if (result.alreadyComplete) {
        return res.json({
          alreadyComplete: true,
          accountId: result.accountId,
        });
      }

      res.json({ authorizationUrl: result.onboardingUrl });
    } catch (error) {
      console.error("Error initiating Stripe Connect onboarding:", error);
      res.status(500).json({ error: "Failed to initiate Stripe Connect" });
    }
  });

  // ---------------------------
  // STRIPE CONNECT: Get connection status
  // ---------------------------
  app.get("/host/stripe/connect/status", requireAuth, async (req, res) => {
    try {
      const status = await getConnectedAccountStatus(req.user.id);
      res.json(status);
    } catch (error) {
      console.error("Error getting Stripe Connect status:", error);
      res.status(500).json({ error: "Failed to get Stripe Connect status" });
    }
  });

  // ---------------------------
  // STRIPE CONNECT: Disconnect account
  // ---------------------------
  app.post("/host/stripe/connect/disconnect", requireAuth, async (req, res) => {
    try {
      const result = await disconnectStripeAccount(req.user.id);
      res.json(result);
    } catch (error) {
      console.error("Error disconnecting Stripe account:", error);
      res.status(500).json({ error: "Failed to disconnect Stripe account" });
    }
  });
}
