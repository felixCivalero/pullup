// Browser error reporting — the client half of "see everything".
//
// No-op until VITE_SENTRY_DSN is set (mirrors the backend's observability.js
// contract), so dev and un-provisioned builds behave exactly as before.
// Captures unhandled JS errors + promise rejections automatically; render
// crashes arrive via reportError() from the ErrorBoundary.
//
// The ignore list keeps flaky-network noise out of the signal: a guest on bad
// Nairobi data produces aborted fetches and load failures constantly — those
// are CONDITIONS, not bugs. Real bugs (TypeError in our code, render crashes)
// still report fine even when triggered by slow networks.
import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;
let enabled = false;

export function initErrorReporting() {
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE || "production",
      tracesSampleRate: 0, // errors only — no perf traces, no replay, no bill surprises
      ignoreErrors: [
        "Failed to fetch",
        "NetworkError",
        "Load failed",
        "AbortError",
        "The operation was aborted",
        "cancelled", // Safari's fetch-abort wording
        /^ResizeObserver loop/,
        // Android WebView JS↔Java bridge dying on teardown — thrown by scripts
        // the Instagram/Facebook in-app browser injects, not by our code.
        /Java object is gone/,
      ],
      // Browser extensions and in-app-browser injected scripts (iabjs:// is
      // Instagram/Facebook's WebView instrumentation) — drop them.
      denyUrls: [
        /extensions\//i,
        /^chrome:\/\//i,
        /^moz-extension:\/\//i,
        /^iabjs:/i,
      ],
    });
    enabled = true;
  } catch {
    /* error reporting must never break the app */
  }
}

// Safe anywhere, never throws, no-op when not initialised.
export function reportError(error, extra) {
  if (!enabled) return;
  try {
    Sentry.captureException(error, extra ? { extra } : undefined);
  } catch {
    /* never throw from the reporter */
  }
}
