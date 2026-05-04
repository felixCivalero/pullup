// Shared analytics helpers — extracted from LandingPage so onboarding,
// login and any future surface fire the same funnel events. Whitelisted
// funnel names also POST to /t/event for the admin analytics page;
// everything else stays gtag-only so debug pings don't hit the DB.
import { publicFetch } from "./api.js";

const FUNNEL_EVENTS = new Set([
  "cta_click",
  "onboarding_step_view",
  "onboarding_skip",
  "auth_start",
  "signed_in",
]);

export function getVisitorId() {
  try {
    let id = localStorage.getItem("pullup_visitor_id");
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("pullup_visitor_id", id);
    }
    return id;
  } catch {
    return null;
  }
}

export function trackEvent(name, props) {
  try {
    if (typeof window !== "undefined" && window.gtag)
      window.gtag("event", name, props);
  } catch {}
  if (!FUNNEL_EVENTS.has(name)) return;
  try {
    const visitorId = getVisitorId();
    if (!visitorId) return;
    publicFetch("/t/event", {
      method: "POST",
      body: JSON.stringify({
        visitorId,
        eventName: name,
        deviceType:
          typeof window !== "undefined" && window.innerWidth < 768
            ? "mobile"
            : "desktop",
        props: props || null,
      }),
    }).catch(() => {});
  } catch {
    // swallow — tracking must never break the page
  }
}
