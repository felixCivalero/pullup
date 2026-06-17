// Read a connected creator's REAL usage from their Supabase project Metrics API
// — the per-project Prometheus endpoint, HTTP Basic auth with the service-role
// key (which we already store, encrypted). v1 reads DATABASE SIZE: a gauge of
// current stored bytes, the smooth basis the 30% markup is taken on (matches
// the "your data" slider). Egress (a counter needing month-deltas) is a later
// add once the metric names are confirmed against a live endpoint.
//
// Best-effort by design: returns null on any failure and 0 for a metric we
// can't find, so a creator is NEVER over-charged from a shape we didn't expect.
//
// Endpoint: https://<ref>.supabase.co/customer/v1/privileged/metrics
// Auth:     Basic base64("service_role:<service key>")

// Candidate metric names for total database size (postgres_exporter gauge).
// Tunable via STORAGE_DB_SIZE_METRICS (comma-separated) without a deploy, since
// the exact name is best confirmed against a live project's /metrics output.
function dbSizeMetricNames() {
  const env = (process.env.STORAGE_DB_SIZE_METRICS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return env.length ? env : ["pg_database_size_bytes"];
}

// Sum every sample of any of `names` in a Prometheus exposition text. Returns
// null if no matching sample is present (so callers can distinguish "0 bytes"
// from "metric absent").
export function sumPromMetric(text, names) {
  if (!text) return null;
  let total = 0;
  let found = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    for (const name of names) {
      if (line.startsWith(`${name}{`) || line.startsWith(`${name} `)) {
        const val = Number(line.split(/\s+/).pop());
        if (Number.isFinite(val)) { total += val; found = true; }
        break;
      }
    }
  }
  return found ? total : null;
}

export async function getProjectUsage(projectRef, serviceKey) {
  if (!projectRef || !serviceKey) return null;
  const url = `https://${projectRef}.supabase.co/customer/v1/privileged/metrics`;
  const auth = "Basic " + Buffer.from(`service_role:${serviceKey}`).toString("base64");
  try {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const text = await res.text();
    const dbBytes = sumPromMetric(text, dbSizeMetricNames()) || 0;
    return { dbBytes, storageBytes: 0, egressBytes: 0 };
  } catch {
    return null;
  }
}
