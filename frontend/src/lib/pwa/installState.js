// Module-level capture of the browser's install signal.
//
// `beforeinstallprompt` fires once, early, and often BEFORE any React component
// has mounted. If we only listened inside a component we'd miss it. So we attach
// at import time (main.jsx imports this), stash the deferred event, and let the
// usePwaInstall hook subscribe for changes. This is the single source of truth
// for "can this browser install right now?".

let deferredPrompt = null;
let installed = false;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Stop Chrome's default mini-infobar — we show our own branded prompt.
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function getDeferredPrompt() {
  return deferredPrompt;
}

export function wasInstalledThisSession() {
  return installed;
}

/** Consume the deferred prompt: fire the native dialog, return the outcome. */
export async function fireInstallPrompt() {
  if (!deferredPrompt) return null;
  const promptEvent = deferredPrompt;
  deferredPrompt = null; // a deferred prompt can only be used once
  notify();
  promptEvent.prompt();
  try {
    const { outcome } = await promptEvent.userChoice;
    return outcome; // "accepted" | "dismissed"
  } catch {
    return null;
  }
}

export function subscribeInstallState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
