// Verify the request-metrics layer over HTTP: generate traffic, then read
// /internal/metrics as a throwaway admin and assert the aggregate saw it.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const backendEnv = fs.readFileSync("/Users/felixcivalero/projects/pullup/backend/.env", "utf8");
const frontendEnv = fs.readFileSync("/Users/felixcivalero/Projects/pullup/frontend/.env", "utf8");
const grab = (src, key) => (src.match(new RegExp(`^${key}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "");
const admin = createClient(grab(backendEnv, "SUPABASE_URL"), grab(backendEnv, "SUPABASE_SERVICE_KEY"), { auth: { persistSession: false } });
const anon = createClient(grab(backendEnv, "SUPABASE_URL"), grab(frontendEnv, "VITE_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
const API = process.env.API_BASE || "http://localhost:3210";

const email = `e2e_metrics_${Date.now()}@example.com`;
let userId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  // traffic: 3 public hits + 1 guaranteed 404
  for (let i = 0; i < 3; i++) await fetch(`${API}/mcp/health`);
  await fetch(`${API}/definitely-not-a-route`);

  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  userId = created.user.id;
  // an admin probe needs the is_admin flag on the profile row
  await admin.from("profiles").upsert({ id: userId, is_admin: true });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });

  const res = await fetch(`${API}/internal/metrics`, { headers: { Authorization: `Bearer ${sess.session.access_token}` } });
  ok(res.status === 200, `admin can read /internal/metrics (${res.status})`);
  const m = await res.json();
  ok(typeof m.uptimeMin === "number" && m.lastHour && Array.isArray(m.routes), "snapshot shape");
  const health = m.routes.find((r) => r.route.includes("/mcp/health"));
  ok(health && health.count >= 3 && health.p95Ms >= 0, `health route aggregated (count=${health?.count}, p95=${health?.p95Ms}ms)`);
  ok(m.routes.some((r) => r.route.includes("(unmatched)")), "404s collapse to (unmatched)");

  const anonRes = await fetch(`${API}/internal/metrics`);
  ok(anonRes.status === 401 || anonRes.status === 403, `unauthenticated blocked (${anonRes.status})`);
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
} finally {
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.from("people").delete().eq("email", email.toLowerCase());
    await admin.auth.admin.deleteUser(userId);
    console.log("🧹 throwaway admin deleted");
  }
}
process.exit(failures ? 1 : 0);
