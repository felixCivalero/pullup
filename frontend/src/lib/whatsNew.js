// "What's new" walkthrough — first-login-after-redesign state.
//
// Per-browser flag (not server-side): the walkthrough is a one-time reveal of
// the 2026 redesign, scoped to desktop. A host on two computers seeing it twice
// is acceptable; it saves a profiles migration + round-trip. Bump the version
// suffix to re-trigger for everyone on the next big release.
export const WHATS_NEW_KEY = "pullup_whatsnew_2026_seen";

// Fired to re-open the walkthrough on demand (Settings → "What's new").
// A global event keeps the trigger decoupled from where the modal is mounted.
export const WHATS_NEW_REOPEN_EVENT = "pullup:open-whatsnew";

export function hasSeenWhatsNew() {
  try {
    return localStorage.getItem(WHATS_NEW_KEY) === "1";
  } catch {
    // Storage blocked (private mode / hardened browser): don't nag.
    return true;
  }
}

export function markWhatsNewSeen() {
  try {
    localStorage.setItem(WHATS_NEW_KEY, "1");
  } catch {
    // no-op
  }
}

export function openWhatsNew() {
  window.dispatchEvent(new Event(WHATS_NEW_REOPEN_EVENT));
}
