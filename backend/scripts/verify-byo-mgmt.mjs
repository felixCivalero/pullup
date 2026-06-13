// De-risks the OAuth flow's Management-API calls by validating their REAL
// response shapes — using the PAT (interchangeable with an OAuth token for the
// Management API) against the existing TEST_BYO project. Proves list-orgs,
// get-project-status, and fetch-service-key work for real, so the only
// unproven part of the live OAuth run is the browser consent + token exchange.
//
// Run from backend/:  node scripts/verify-byo-mgmt.mjs
import dotenv from "dotenv";
dotenv.config();

const PAT = process.env.TEST_BYO_MGMT_PAT;
const RAW = process.env.TEST_BYO_PROJECT_REF || "";
const REF = (RAW.match(/^https?:\/\/([a-z0-9]+)\.supabase\./i)?.[1]) || RAW.replace(/^https?:\/\//, "").replace(/\.supabase\..*$/, "");
const EXPECTED_KEY = process.env.TEST_BYO_SERVICE_KEY;

const mgmt = await import("../src/services/byo/managementApi.js");
let failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  if (!PAT || !REF) { console.log("⏭  TEST_BYO_MGMT_PAT / PROJECT_REF not set — skipping"); process.exit(2); }

  // 1. list organizations — the OAuth flow needs an org id to create a project
  const orgs = await mgmt.listOrganizations(PAT);
  ok(Array.isArray(orgs) && orgs.length > 0 && !!orgs[0].id, `listOrganizations returns orgs with ids (${orgs.length}, first=${orgs[0]?.id})`);

  // 2. get project — the readiness poll keys off .status
  const project = await mgmt.getProject(PAT, REF);
  ok(!!project && typeof project.status === "string", `getProject returns a status (${project?.status})`);

  // 3. fetch the service key — the heart of "the creator never pastes a key"
  const sk = await mgmt.getProjectServiceKey(PAT, REF);
  ok(!!sk, `getProjectServiceKey returns a key (${sk ? sk.length + " chars" : "null"})`);
  if (sk && EXPECTED_KEY) ok(sk === EXPECTED_KEY, "fetched service key MATCHES the one you pasted — keyless fetch confirmed");
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
}
process.exit(failures ? 1 : 0);
