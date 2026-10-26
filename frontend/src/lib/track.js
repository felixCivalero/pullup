// The analytics SDK — batched, exactly-once, and stateless on the device
// unless the visitor says yes to being counted (lib/consent.js).
//
// Every event gets a client-minted UUID and a timestamp, queues in memory,
// and flushes to POST /t/batch on a 5s timer / 20-event high-water mark /
// pagehide (via sendBeacon, so deep-scroll and exit events survive the tab
// closing). The server upserts on the event UUID, so a retried batch can never
// double-count.
//
// The visit (session_id) is a random id per page load, in memory only — that
// needs no consent under LEK 9:28 / ePrivacy. The visitor (visitor_id) is the
// same id, unless the visitor switched on the stats cookie: then it's the id
// kept in their browser, so Statistik can count unique visitors over time.
// A batch that fails is dropped, never stored for later.
//
// Tracking must never break a page: every entry point swallows.

import { API_BASE } from "./env.js";
import { getConsentedVisitorId } from "./consent.js";

// Keys earlier versions stored on the device — cleared on load.
const OLD_KEYS = ["pullup_visitor_id", "pullup_session", "pullup_track_retry"];
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_AT_QUEUE_SIZE = 20;

let queue = [];
let flushTimer = null;
let context = null; // captured once per page load

function uuid() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  // RFC4122-ish fallback for ancient in-app browsers.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// One random id per page load, in memory only.
let pageId = null;
export function getVisitorId() {
  if (!pageId) pageId = uuid();
  return pageId;
}

// Only the live site counts: a dev server writes to the same database, and its
// visits used to show up in Statistik as "localhost".
const LIVE = typeof window !== "undefined" && /(^|\.)pullup\.se$/.test(window.location.hostname);

function getContext() {
  if (context) return context;
  let utm = null;
  try {
    const params = new URLSearchParams(window.location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = params.get(k);
      if (v) { utm = utm || {}; utm[k] = v; }
    }
    // ?ref=mejl is the short form we put in links (pullup.se/case → ?ref=mejl).
    const ref = params.get("ref");
    if (ref && !utm?.utm_source) { utm = utm || {}; utm.utm_source = ref; }
  } catch { /* no utm */ }
  context = {
    referrer: (typeof document !== "undefined" && document.referrer) || null,
    utm,
    deviceType:
      typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop",
  };
  return context;
}

function buildPayload(events) {
  const ctx = getContext();
  return {
    visitorId: getConsentedVisitorId() || getVisitorId(),
    sessionId: getVisitorId(),
    deviceType: ctx.deviceType,
    referrer: ctx.referrer,
    utm: ctx.utm,
    page: "landing",
    events,
  };
}

function clearOldStorage() {
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k);
  } catch { /* storage blocked — nothing to clear */ }
}

export function flush({ beacon = false } = {}) {
  if (queue.length === 0) return;
  if (!LIVE) { queue = []; return; }
  const events = queue;
  queue = [];
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }

  const payload = buildPayload(events);
  if (!payload.visitorId) return;
  const url = `${API_BASE}/t/batch`;
  const body = JSON.stringify(payload);

  try {
    if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      // sendBeacon can't set Content-Type via init — wrap in a Blob.
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => { /* dropped — nothing is kept on the device */ });
  } catch { /* never break the page */ }
}

function scheduleFlush() {
  if (queue.length >= FLUSH_AT_QUEUE_SIZE) { flush(); return; }
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_INTERVAL_MS);
}

// The one entry point: queue an event for the spine. Identified surfaces
// (rooms) pass opts {page, eventId, userId} — those ride per-event so one
// batch can span surfaces; anonymous surfaces just omit them.
export function track(name, props, opts = {}) {
  try {
    queue.push({
      id: uuid(),
      name,
      props: props || null,
      ts: Date.now(),
      ...(opts.page ? { page: opts.page } : {}),
      ...(opts.eventId ? { eventId: opts.eventId } : {}),
      ...(opts.userId ? { userId: opts.userId } : {}),
    });
    scheduleFlush();
  } catch { /* never break the page */ }
}

export function trackPageView(page = "landing") {
  track("page_view", { page });
}

// Wire the lifecycle once per load: clear what older versions stored and make
// sure whatever is queued goes out when the page is hidden or closed.
let lifecycleWired = false;
export function initTracking() {
  if (lifecycleWired || typeof window === "undefined") return;
  lifecycleWired = true;
  clearOldStorage();
  const onHide = () => flush({ beacon: true });
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
}
