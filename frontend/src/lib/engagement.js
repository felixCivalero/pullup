// Reading, measured — what Statistik's visit journeys are made of.
//
// While a page is open this counts *active* seconds: the tab is visible and
// the visitor did something (scrolled, moved, touched, typed) within the last
// IDLE_MS. Each active second goes to the [data-pc-section] under the middle
// of the screen. It also keeps the deepest point reached, and logs every link
// or button pressed and every copy (where, never what was copied).
//
// Sent as `engagement` events carrying deltas since the last one: every
// HEARTBEAT_MS while there's something new, and when the tab is hidden, the
// page closes or the route changes. Same rules as track.js: nothing stored in
// the browser, no consent needed, never breaks the page.

import { flush, track } from "./track.js";

const TICK_MS = 1000;
const IDLE_MS = 45000; // reading a long paragraph without touching anything
const HEARTBEAT_MS = 15000;

let page = null; // current path
let pending = null; // { active, s: { section: secs } } since the last send
let depth = 0; // deepest point on this page, % of its height
let sentDepth = 0;
let lastInput = 0;
let wired = false;

const now = () => Date.now();

function reset() {
  pending = { active: 0, s: {} };
}

function sectionAtMiddle() {
  try {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    if (el?.closest?.(".rq-backdrop")) return "form"; // the request form is open on top
    return el?.closest?.("[data-pc-section]")?.getAttribute("data-pc-section") || null;
  } catch {
    return null;
  }
}

function measureDepth() {
  try {
    const doc = document.documentElement;
    const h = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
    if (!h) return;
    const d = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / h) * 100));
    if (d > depth) depth = d;
  } catch { /* never break the page */ }
}

function tick() {
  if (!page || document.visibilityState !== "visible" || now() - lastInput > IDLE_MS) return;
  pending.active += 1;
  const s = sectionAtMiddle();
  if (s) pending.s[s] = (pending.s[s] || 0) + 1;
}

// Queue what's new since the last send for the current page.
function send() {
  if (!page || !pending) return;
  measureDepth();
  if (pending.active === 0 && depth === sentDepth) return;
  track("engagement", { page, active: pending.active, depth, s: pending.s });
  sentDepth = depth;
  reset();
}

function onInput() {
  lastInput = now();
}

function labelOf(el) {
  const own = el.getAttribute("data-track") || el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "";
  return own.replace(/\s+/g, " ").trim().slice(0, 60);
}

function hrefOf(el) {
  const raw = el.getAttribute?.("href");
  if (!raw) return null;
  if (raw.startsWith("mailto:")) return "mailto";
  if (raw.startsWith("tel:")) return "tel";
  try {
    const u = new URL(raw, window.location.href);
    return u.origin === window.location.origin ? u.pathname + u.hash : `${u.host}${u.pathname}`.slice(0, 120);
  } catch {
    return null;
  }
}

function whereIs(el) {
  return (
    el.closest("[data-pc-section]")?.getAttribute("data-pc-section") ||
    (el.closest(".rq") ? "form" : el.closest("header") ? "nav" : el.closest("footer") ? "footer" : null)
  );
}

function onClick(e) {
  try {
    onInput();
    const el = e.target?.closest?.("a, button, [role='button']");
    if (!el) return;
    const label = labelOf(el);
    const href = hrefOf(el);
    if (!label && !href) return;
    track("click", { label, ...(href ? { href } : {}), section: whereIs(el), page });
  } catch { /* never break the page */ }
}

function onCopy() {
  try {
    const sel = String(window.getSelection?.() || "");
    const node = window.getSelection?.()?.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    track("copy", { section: el ? whereIs(el) : null, page, chars: sel.length });
  } catch { /* never break the page */ }
}

function onHide() {
  send();
  flush({ beacon: true });
}

// Start measuring (once per page load) — AgencyShell calls this.
export function initEngagement() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  reset();
  lastInput = now();
  for (const type of ["scroll", "wheel", "pointermove", "pointerdown", "touchstart", "keydown"]) {
    window.addEventListener(type, onInput, { passive: true, capture: true });
  }
  window.addEventListener("scroll", measureDepth, { passive: true });
  document.addEventListener("click", onClick, true);
  document.addEventListener("copy", onCopy, true);
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
    else lastInput = now();
  });
  setInterval(tick, TICK_MS);
  setInterval(() => { if (pending?.active) send(); }, HEARTBEAT_MS);
}

// The route changed: close the books on the old page, start the new one.
export function setEngagementPage(path) {
  if (path === page) return;
  send();
  page = path;
  depth = 0;
  sentDepth = 0;
  lastInput = now();
  reset();
  // The new page renders after this; take its first measurement once it has.
  setTimeout(measureDepth, 500);
}
