// backend/src/services/byo/managementApi.js
//
// Supabase Management API client — PullUp's CONTROL plane into a creator's own
// project. This is the scalable/stable choice for fleet operations: stateless
// HTTPS, no connection pools to manage across thousands of projects, the
// official versioned API, and the exact surface OAuth wraps later (PAT now →
// OAuth token later, same calls).
//
// Two uses:
//   runProjectSql  — run DDL (provision the schema) / arbitrary SQL on the
//                    creator's project. The service key (PostgREST) CAN'T do
//                    DDL; this can.
//   getProjectTier — read the project's subscription tier / usage, which feeds
//                    the 30% storage-markup billing line.
//
// The token is the creator's Management API PAT (or, later, an OAuth access
// token), stored encrypted in creator_databases.encrypted_mgmt_token. Never
// logged.

const BASE = "https://api.supabase.com";

async function mgmtFetch(token, path, { method = "GET", body = null } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const msg = (json && json.message) || res.status;
    const err = new Error(`mgmt_api_${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Run SQL against a project's database (DDL allowed). Used by the provisioner.
export async function runProjectSql(projectRef, token, sql) {
  if (!projectRef || !token || !sql) throw new Error("missing_mgmt_args");
  return mgmtFetch(token, `/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    body: { query: sql },
  });
}

// Reachability/auth probe for a management token against a specific project.
export async function pingProject(projectRef, token) {
  try {
    await mgmtFetch(token, `/v1/projects/${projectRef}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// The project's tier/usage → the base the 30% storage markup is taken on. The
// Management API exposes subscription + usage endpoints; we surface a normalized
// monthly-cost-cents figure for creator_billing_plans.storage_tier_cents. Best
// effort: returns null if the API shape isn't available (billing line stays 0).
export async function getProjectTier(projectRef, token) {
  try {
    const sub = await mgmtFetch(token, `/v1/projects/${projectRef}/billing/subscription`).catch(() => null);
    // Shape varies by plan; we read the most stable signal we can and leave the
    // precise cents mapping to the billing job that consumes this.
    return {
      tier: sub?.plan?.id || sub?.tier || null,
      raw: sub || null,
    };
  } catch {
    return null;
  }
}
