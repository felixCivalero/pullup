// backend/src/routes/billing.js
//
// The host's money mirror: their plan, this month's metered motions, and the
// fees accrued — the "you pay on motion, never on storage" promise as a
// readable surface. Read-only; plan changes are concierge (admin/SQL) for now.

import { requireAuth } from "../middleware/auth.js";
import { getBillingSummary } from "../repos/billing.js";
import { meteringEnabled, paymentsV2Enabled, configuredRails } from "../config/billing.js";

export function registerBillingRoutes(app) {
  app.get("/host/billing/summary", requireAuth, async (req, res) => {
    try {
      const summary = await getBillingSummary(req.user.id);
      res.json({
        ...summary,
        metering: meteringEnabled(),
        paymentsV2: paymentsV2Enabled(),
        rails: configuredRails(),
      });
    } catch (error) {
      console.error("[billing] summary failed:", error);
      res.status(500).json({ error: "billing_summary_failed" });
    }
  });
}
