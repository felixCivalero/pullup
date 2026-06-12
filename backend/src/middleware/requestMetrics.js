// Request metrics — the numbers layer for "full control of flows".
//
// Every response is aggregated in memory per `METHOD route` (the matched
// Express route pattern, so /events/abc123 and /events/xyz789 are ONE row):
// count, 4xx/5xx, avg/max duration, and a small reservoir of recent durations
// for p50/p95. Snapshot served by GET /internal/metrics (admin-gated).
//
// Deliberately process-local and approximate: it resets on restart, costs no
// I/O on the hot path, and needs no infrastructure. It answers "which route is
// slow / failing, roughly how much" — the question we previously couldn't
// answer at all. Durable history can ride on top later if we want it.
//
// Slow (>2s) and 5xx responses also get a structured log line, so pm2 logs
// carry the outliers even between snapshot looks.

import { logger } from "../logger.js";

const RESERVOIR = 200; // recent durations kept per route for percentiles
const MAX_ROUTES = 500; // cardinality guard (unmatched paths collapse below)
const SLOW_MS = 2000;

const routes = new Map(); // "METHOD route" -> stats
const bootedAt = Date.now();

// last-60-minutes ring: one bucket per minute, totals only
const MINUTES = 60;
const ring = Array.from({ length: MINUTES }, () => ({ min: -1, count: 0, errors: 0, totalMs: 0 }));

function routeLabel(req) {
  // req.route is set only when a route matched; baseUrl covers mounted routers.
  if (req.route?.path) return `${req.baseUrl || ""}${req.route.path}`;
  return "(unmatched)";
}

function record(method, route, status, ms) {
  const key = `${method} ${route}`;
  let s = routes.get(key);
  if (!s) {
    if (routes.size >= MAX_ROUTES) return;
    s = { count: 0, s4xx: 0, s5xx: 0, totalMs: 0, maxMs: 0, durs: [] };
    routes.set(key, s);
  }
  s.count++;
  if (status >= 500) s.s5xx++;
  else if (status >= 400) s.s4xx++;
  s.totalMs += ms;
  if (ms > s.maxMs) s.maxMs = ms;
  if (s.durs.length >= RESERVOIR) s.durs[s.count % RESERVOIR] = ms;
  else s.durs.push(ms);

  const nowMin = Math.floor(Date.now() / 60000);
  const b = ring[nowMin % MINUTES];
  if (b.min !== nowMin) { b.min = nowMin; b.count = 0; b.errors = 0; b.totalMs = 0; }
  b.count++;
  b.totalMs += ms;
  if (status >= 500) b.errors++;
}

export function requestMetrics(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const route = routeLabel(req);
    record(req.method, route, res.statusCode, ms);
    if (res.statusCode >= 500 || ms > SLOW_MS) {
      logger.warn("[req]", {
        method: req.method,
        route,
        status: res.statusCode,
        ms: Math.round(ms),
        slow: ms > SLOW_MS || undefined,
      });
    }
  });
  next();
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export function metricsSnapshot() {
  const perRoute = [...routes.entries()].map(([key, s]) => {
    const sorted = [...s.durs].sort((a, b) => a - b);
    return {
      route: key,
      count: s.count,
      "4xx": s.s4xx,
      "5xx": s.s5xx,
      avgMs: Math.round(s.totalMs / s.count),
      p50Ms: Math.round(pct(sorted, 50)),
      p95Ms: Math.round(pct(sorted, 95)),
      maxMs: Math.round(s.maxMs),
    };
  });
  const nowMin = Math.floor(Date.now() / 60000);
  const hour = ring.filter((b) => nowMin - b.min < MINUTES);
  const hourCount = hour.reduce((a, b) => a + b.count, 0);
  return {
    sinceBoot: new Date(bootedAt).toISOString(),
    uptimeMin: Math.round((Date.now() - bootedAt) / 60000),
    lastHour: {
      requests: hourCount,
      errors5xx: hour.reduce((a, b) => a + b.errors, 0),
      avgMs: hourCount ? Math.round(hour.reduce((a, b) => a + b.totalMs, 0) / hourCount) : 0,
    },
    routes: perRoute.sort((a, b) => b.count - a.count),
    slowest: [...perRoute].filter((r) => r.count >= 5).sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 15),
  };
}
