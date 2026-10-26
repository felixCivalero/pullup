// The one cookie choice on the site: may I count you as a returning visitor?
//
// "on"  → a random visitor id is kept in this browser (localStorage), so the
//         same person on Monday and on Friday counts as one unique visitor in
//         Statistik. Nothing else is stored or linked to it.
// "off" → nothing is kept; every page load is a stranger, as before.
// null  → not asked yet; the banner asks.
//
// Keeping the choice itself is necessary to respect it, so it needs no
// consent. Felix 2026-10-26: "dom vi får får vi" — count only those who say yes.

import { track } from "./track.js";

const CHOICE_KEY = "pullup.stats";
const ID_KEY = "pullup.vid";

const listeners = new Set();

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked: treat as not asked, and never store
  }
}

export function getConsent() {
  const v = read(CHOICE_KEY);
  return v === "on" || v === "off" ? v : null;
}

// The kept visitor id — only while the choice is "on".
export function getConsentedVisitorId() {
  if (getConsent() !== "on") return null;
  return read(ID_KEY);
}

function uuid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function setConsent(on) {
  try {
    localStorage.setItem(CHOICE_KEY, on ? "on" : "off");
    if (on) {
      if (!read(ID_KEY)) localStorage.setItem(ID_KEY, uuid());
    } else {
      localStorage.removeItem(ID_KEY);
    }
  } catch { /* storage blocked — the choice can't be kept */ }
  // Sent after the id is set or removed: a yes counts this visitor from now,
  // a no is counted only as a no (Statistik shows how many say yes).
  track("consent", { on: Boolean(on) });
  for (const fn of listeners) fn(getConsent());
}

export function onConsentChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
