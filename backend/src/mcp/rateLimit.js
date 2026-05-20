// Per-PAT rate limit for the /mcp endpoint.
//
// Token bucket, in-memory, keyed by the SHA-256 of the bearer token (so
// plaintext never lives in process memory after auth). Defaults to 60
// requests per minute per token — generous for normal chat use, snug
// enough that a runaway client doesn't burn through Supabase admin quota.
//
// This is fine for a single backend node. If/when we run multiple nodes
// we'll swap the in-memory map for Redis behind the same `consume()` API.

import crypto from "node:crypto";

const DEFAULT_CAPACITY = Number(process.env.MCP_RATE_LIMIT_CAPACITY) || 60;
const DEFAULT_REFILL_PER_SEC = (Number(process.env.MCP_RATE_LIMIT_PER_MIN) || 60) / 60;

const buckets = new Map(); // hash -> { tokens, last }

function tokenKey(plaintext) {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

// Returns { allowed, retryAfterSec }.
//   allowed=true  → caller continues, one token has been spent.
//   allowed=false → caller should 429 and surface retryAfterSec.
export function consume(plaintextToken, { capacity = DEFAULT_CAPACITY, refillPerSec = DEFAULT_REFILL_PER_SEC } = {}) {
  const key = tokenKey(plaintextToken);
  const now = Date.now();
  const b = buckets.get(key) || { tokens: capacity, last: now };
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
  b.last = now;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    buckets.set(key, b);
    return { allowed: true, retryAfterSec: 0 };
  }
  buckets.set(key, b);
  const need = 1 - b.tokens;
  const retryAfterSec = Math.max(1, Math.ceil(need / refillPerSec));
  return { allowed: false, retryAfterSec };
}

// Periodically drop buckets that have been idle for a while so memory
// doesn't leak as tokens come and go. Cheap: scan once a minute, drop
// anything untouched for an hour.
const IDLE_MS = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now - v.last > IDLE_MS) buckets.delete(k);
  }
}, 60 * 1000).unref();
