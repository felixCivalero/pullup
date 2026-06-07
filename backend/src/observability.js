// backend/src/observability.js
//
// Error sink. Until now the backend failed in the dark: errors went to stderr
// (lost on a worker restart) and several critical paths swallowed exceptions
// with `.catch(() => {})`. This wires a remote error tracker so a production
// spike is visible, aggregated, and alertable.
//
// Sentry is OPTIONAL and lazy: with no SENTRY_DSN set, everything here is a
// no-op, so dev and any un-provisioned environment behave exactly as before.
// The @sentry/node import is dynamic + guarded, so a missing package degrades
// to a warning instead of crashing boot. Set SENTRY_DSN on the prod box to
// light it up — no code change needed.

let sentry = null;
let enabled = false;

export async function initObservability({ serviceName = "pullup-api" } = {}) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // no DSN → silent no-op (unchanged behaviour)
  try {
    sentry = await import("@sentry/node");
    sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      release: process.env.GIT_SHA || undefined,
      // We want errors, not perf traces — keep the bill and noise down.
      tracesSampleRate: 0,
      initialScope: { tags: { service: serviceName } },
    });
    enabled = true;
    // eslint-disable-next-line no-console
    console.log(`[observability] Sentry initialised for ${serviceName}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[observability] SENTRY_DSN set but @sentry/node unavailable — error tracking off",
      err?.message,
    );
  }
}

/**
 * Send an exception to the tracker. Safe to call anywhere, anytime: a no-op
 * until initObservability() succeeds, and it never throws (an observability
 * failure must never break the path it's observing).
 *
 * @param {unknown} err            the thrown value (Error or otherwise)
 * @param {object} [context]       structured extras (ids, channel, reasons…)
 */
export function captureError(err, context) {
  if (!enabled || !sentry) return;
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* observability must never throw */
  }
}

export function isObservabilityEnabled() {
  return enabled;
}
