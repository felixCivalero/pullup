// Shared credential resolution for the HTTP probes, so the same script runs
// on a dev machine AND inside the deploy gate on the EC2 box: prefer real
// environment variables, fall back to the backend/frontend .env files located
// RELATIVE to this script (works in any checkout, no absolute paths).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // <repo>/backend/scripts
const backendEnv = path.join(here, "..", ".env");
const frontendEnv = path.join(here, "..", "..", "frontend", ".env");

function grab(file, key) {
  try {
    return (fs.readFileSync(file, "utf8").match(new RegExp(`^${key}=(.*)$`, "m")) || [])[1]
      ?.trim()
      .replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
}

export const SUPABASE_URL = process.env.SUPABASE_URL || grab(backendEnv, "SUPABASE_URL");
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || grab(backendEnv, "SUPABASE_SERVICE_KEY");
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY || grab(frontendEnv, "VITE_SUPABASE_ANON_KEY");
// Where the server-under-test listens. The deploy gate boots the NEW code on a
// side port and points this at it; locally it defaults to the dev convention.
export const API_BASE = process.env.API_BASE || "http://localhost:3210";

for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_KEY, ANON_KEY })) {
  if (!v) {
    console.error(`probeEnv: missing ${k} (set it in the environment or the .env files)`);
    process.exit(1);
  }
}

// The Creator-tier paywall is live on prod-shaped configs: publishing needs an
// active subscription, so every probe's THROWAWAY host must be granted hosting
// right after creation or its publish comes back 402 and the deploy gate goes
// red (exactly what happened on the first paywall deploy, 2026-07-05). The
// grant is a plan row shaped like what the Stripe webhook writes; revoke it in
// cleanup. No-ops harmlessly when enforcement is off.
// (verify-subscriptions.mjs deliberately does NOT use this — probing the
// paywall itself is its whole job.)
export async function grantHosting(admin, hostId) {
  if (!hostId) return;
  await admin.from("creator_billing_plans").upsert(
    { host_id: hostId, plan: "creator", subscription_status: "active", notes: "probe throwaway" },
    { onConflict: "host_id" },
  );
}

export async function revokeHosting(admin, hostId) {
  if (!hostId) return;
  await admin.from("creator_billing_plans").delete().eq("host_id", hostId);
}

// gate-path verification run 2026-06-12 (no-op)
