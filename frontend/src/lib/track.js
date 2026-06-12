// The analytics SDK — batched, sessionized, exactly-once event tracking.
//
// Every event gets a client-minted UUID and a timestamp, queues in memory,
// and flushes to POST /t/batch on a 5s timer / 20-event high-water mark /
// pagehide (via sendBeacon, so deep-scroll and exit events survive the tab
// closing). Failed batches persist to localStorage and retry on next load.
// The server upserts on the event UUID, so a retried batch can never
// double-count.
//
// Tracking must never break a page: every entry point swallows.

import { API_BASE } from "./env.js";

const VISITOR_KEY = "pullup_visitor_id";
const SESSION_KEY = "pullup_session";
const RETRY_KEY = "pullup_track_retry";
const SESSION_IDLE_MS = 30 * 60 * 1000;
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_AT_QUEUE_SIZE = 20;
const RETRY_CAP = 100;

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

export function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

// Session id rotates after 30 minutes of inactivity. Stored in localStorage
// (not sessionStorage) so a same-tab reload within the window keeps the
// session — that's what makes bounce/session metrics honest.
export function getSessionId() {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const { id, at } = JSON.parse(raw);
      if (id && now - at < SESSION_IDLE_MS) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: now }));
        return id;
      }
    }
    const id = uuid();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: now }));
    return id;
  } catch {
    return null;
  }
}

function getContext() {
  if (context) return context;
  let utm = null;
  try {
    const params = new URLSearchParams(window.location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = params.get(k);
      if (v) { utm = utm || {}; utm[k] = v; }
    }
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
    visitorId: getVisitorId(),
    sessionId: getSessionId(),
    deviceType: ctx.deviceType,
    referrer: ctx.referrer,
    utm: ctx.utm,
    page: "landing",
    events,
  };
}

function stashForRetry(events) {
  try {
    const prev = JSON.parse(localStorage.getItem(RETRY_KEY) || "[]");
    const merged = prev.concat(events).slice(-RETRY_CAP);
    localStorage.setItem(RETRY_KEY, JSON.stringify(merged));
  } catch { /* storage full or blocked — drop */ }
}

function recoverRetries() {
  try {
    const prev = JSON.parse(localStorage.getItem(RETRY_KEY) || "[]");
    if (prev.length) {
      localStorage.removeItem(RETRY_KEY);
      queue = prev.concat(queue);
    }
  } catch { /* ignore */ }
}

export function flush({ beacon = false } = {}) {
  if (queue.length === 0) return;
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
      const ok = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      if (!ok) stashForRetry(events);
      return;
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).then((res) => {
      if (!res.ok && res.status !== 400) stashForRetry(events);
    }).catch(() => stashForRetry(events));
  } catch {
    stashForRetry(events);
  }
}

function scheduleFlush() {
  if (queue.length >= FLUSH_AT_QUEUE_SIZE) { flush(); return; }
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_INTERVAL_MS);
}

// The one entry point: queue an event for the spine.
export function track(name, props) {
  try {
    queue.push({ id: uuid(), name, props: props || null, ts: Date.now() });
    scheduleFlush();
  } catch { /* never break the page */ }
}

export function trackPageView(page = "landing") {
  track("page_view", { page });
}

// Wire the lifecycle once per load: recover any stranded batches and make
// sure whatever is queued goes out when the page is hidden or closed.
let lifecycleWired = false;
export function initTracking() {
  if (lifecycleWired || typeof window === "undefined") return;
  lifecycleWired = true;
  recoverRetries();
  const onHide = () => flush({ beacon: true });
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
}
