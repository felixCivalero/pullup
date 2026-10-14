// Open the "Start a conversation" request form from anywhere on the agency
// site (AgencyShell renders it). Also remembers how the visit began, so every
// request can say where it came from.
const ARRIVAL_KEY = "pullup.arrival";
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

export function openRequest({ source, powers = [] } = {}) {
  window.dispatchEvent(new CustomEvent("pullup:request", { detail: { source, powers } }));
}

// First touch of this browser session: landing page, referrer, UTM.
export function rememberArrival() {
  try {
    if (sessionStorage.getItem(ARRIVAL_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const arrival = {
      landingPage: window.location.pathname + window.location.search,
      firstReferrer: document.referrer || "",
      visitStartedAt: new Date().toISOString(),
    };
    for (const k of UTM) if (params.get(k)) arrival[k] = params.get(k);
    sessionStorage.setItem(ARRIVAL_KEY, JSON.stringify(arrival));
  } catch {
    /* storage blocked — the request still carries the current page */
  }
}

export function requestMeta() {
  let arrival = {};
  try {
    arrival = JSON.parse(sessionStorage.getItem(ARRIVAL_KEY) || "{}");
  } catch {
    arrival = {};
  }
  const params = new URLSearchParams(window.location.search);
  const current = {};
  for (const k of UTM) if (params.get(k)) current[k] = params.get(k);
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  return {
    ...arrival,
    ...current,
    page: window.location.href,
    pageTitle: document.title,
    referrer: document.referrer || "",
    language: navigator.language || "",
    siteLang: document.documentElement.lang || "en",
    screen: `${window.screen?.width || 0}×${window.screen?.height || 0}`,
    device: coarse ? (window.innerWidth < 768 ? "phone" : "tablet") : "desktop",
  };
}
