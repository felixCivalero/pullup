// backend/scripts/submit-whatsapp-templates.js
//
// Submit every not-yet-live WhatsApp template in the registry to Meta for
// approval. Run on a box that has the Meta creds in env:
//
//   node scripts/submit-whatsapp-templates.js
//
// Idempotent: skips anything already PENDING / APPROVED / IN_APPEAL on Meta, so
// it's safe to re-run. In sandbox mode it no-ops with synthetic ids — to submit
// for real set WHATSAPP_SANDBOX_MODE=false and WHATSAPP_PROVIDER=meta_cloud
// (and have META_WABA_ID + META_ACCESS_TOKEN set).
//
// NOTE: a phone number can only SEND once its display name is approved (resubmit
// e.g. "PullUp.se" if "Pullup" was rejected) and the business is verified.
// Template approval is independent and can start in parallel — that's this.

import "dotenv/config";
import { TEMPLATES } from "../src/whatsapp/templates/registry.js";
import { submitTemplate, fetchProviderStatus } from "../src/whatsapp/templates/submitter.js";
import { WHATSAPP_SANDBOX_MODE, META_WABA_ID } from "../src/whatsapp/config.js";

const LIVE = new Set(["PENDING", "APPROVED", "IN_APPEAL"]);

async function main() {
  if (WHATSAPP_SANDBOX_MODE) {
    console.log("WHATSAPP_SANDBOX_MODE is ON — submissions are synthetic (no Meta calls).");
    console.log("Set WHATSAPP_SANDBOX_MODE=false and WHATSAPP_PROVIDER=meta_cloud to submit for real.\n");
  }
  if (!WHATSAPP_SANDBOX_MODE && !META_WABA_ID) {
    console.error("META_WABA_ID / META_ACCESS_TOKEN missing — can't submit. Set them in the env.");
    process.exit(1);
  }

  const current = WHATSAPP_SANDBOX_MODE ? {} : await fetchProviderStatus();
  const submitted = [];
  const skipped = [];
  const failed = [];

  for (const key of Object.keys(TEMPLATES)) {
    const tmpl = TEMPLATES[key];
    const existing = current[tmpl.name];
    if (existing && LIVE.has(existing.status)) {
      skipped.push({ key, status: existing.status });
      continue;
    }
    const r = await submitTemplate(key);
    if (r.ok) submitted.push({ key, status: r.status, id: r.provider_template_id });
    else failed.push({ key, error: r.error, code: r.code });
  }

  console.log("\n── WhatsApp template submission ──");
  console.log(`submitted (${submitted.length}): ${submitted.map((s) => s.key).join(", ") || "—"}`);
  console.log(`skipped, already live (${skipped.length}): ${skipped.map((s) => `${s.key}:${s.status}`).join(", ") || "—"}`);
  console.log(`failed (${failed.length}):`);
  for (const f of failed) console.log(`   - ${f.key}: ${f.error}${f.code ? ` (code ${f.code})` : ""}`);
  console.log("\nApproval is async on Meta's clock (utility ~30m–2h, marketing ~24h).");
  console.log("Re-run anytime — it skips anything already pending/approved.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
