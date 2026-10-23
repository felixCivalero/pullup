import { getVisitorId } from "../../lib/track.js";

// Open the "Start a conversation" request form from anywhere on the agency
// site (AgencyShell renders it). Also remembers how the visit began, so every
// request can say where it came from — in memory only, nothing is stored in
// the browser (a reload starts a new visit).
let arrival = null;
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

export function openRequest({ source, powers = [] } = {}) {
  window.dispatchEvent(new CustomEvent("pullup:request", { detail: { source, powers } }));
}

// First touch of this page load: landing page, referrer, UTM.
export function rememberArrival() {
  try {
    sessionStorage.removeItem("pullup.arrival"); // stored by earlier versions
  } catch { /* storage blocked */ }
  if (arrival) return;
  try {
    const params = new URLSearchParams(window.location.search);
    arrival = {
      landingPage: window.location.pathname + window.location.search,
      firstReferrer: document.referrer || "",
      visitStartedAt: new Date().toISOString(),
    };
    for (const k of UTM) if (params.get(k)) arrival[k] = params.get(k);
  } catch {
    /* the request still carries the current page */
  }
}

export function requestMeta() {
  const params = new URLSearchParams(window.location.search);
  const current = {};
  for (const k of UTM) if (params.get(k)) current[k] = params.get(k);
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  return {
    ...(arrival || {}),
    ...current,
    page: window.location.href,
    pageTitle: document.title,
    referrer: document.referrer || "",
    language: navigator.language || "",
    siteLang: document.documentElement.lang || "en",
    screen: `${window.screen?.width || 0}×${window.screen?.height || 0}`,
    device: coarse ? (window.innerWidth < 768 ? "phone" : "tablet") : "desktop",
    // The analytics visit, so Statistik can show the journey behind a request.
    visitId: getVisitorId(),
  };
}
