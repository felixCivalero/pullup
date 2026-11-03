// Event page visits, for the organiser's statistics (backend POST
// /events/:slug/view, lib/eventStats.js). The visit id is the same one the
// sign-up sends, so a sign-up can be traced to where its visit came from. It
// lives for the page load only, unless the visitor switched the stats cookie
// on (then it's the id kept in their browser). Only the live site counts.
import { API_BASE } from "./env.js";
import { getVisitorId } from "./track.js";
import { getConsentedVisitorId } from "./consent.js";

const LIVE = typeof window !== "undefined" && /(^|\.)pullup\.se$/.test(window.location.hostname);

export function eventVisitId() {
  try {
    return getConsentedVisitorId() || getVisitorId();
  } catch {
    return getVisitorId();
  }
}

const sent = new Set();
export function recordEventView(slug) {
  if (!LIVE || !slug || sent.has(slug)) return;
  sent.add(slug);
  try {
    if (localStorage.getItem("pullup.self") === "1") return;
    const q = new URLSearchParams(window.location.search);
    const utm = { source: q.get("utm_source") || (q.get("m") ? "mejl" : ""), medium: q.get("utm_medium") || "", campaign: q.get("utm_campaign") || "", content: q.get("utm_content") || "" };
    fetch(`${API_BASE}/events/${encodeURIComponent(slug)}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId: eventVisitId(), referrer: document.referrer || "", utm }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* tracking never breaks a page */ }
}
