// Shared analytics helpers — now a thin shim over the batched SDK in
// track.js. Same API as before (trackEvent/getVisitorId) so onboarding,
// login and any future surface keep working unchanged; whitelisted funnel
// names ride the /t/batch spine into analytics_events, everything else
// stays gtag-only so debug pings don't hit the DB.
import { track, getVisitorId, initTracking } from "./track.js";

const FUNNEL_EVENTS = new Set([
  "cta_click",
  "onboarding_step_view",
  "onboarding_skip",
  "auth_start",
  "signed_in",
]);

export { getVisitorId };

export function trackEvent(name, props) {
  try {
    if (typeof window !== "undefined" && window.gtag)
      window.gtag("event", name, props);
  } catch { /* gtag missing — fine */ }
  if (!FUNNEL_EVENTS.has(name)) return;
  try {
    initTracking();
    track(name, props);
  } catch {
    // swallow — tracking must never break the page
  }
}
