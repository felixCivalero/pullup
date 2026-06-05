// Tags <html> with `pwa-standalone` when the app is running as an installed
// app (not a browser tab). Lets CSS adapt app-only chrome — and is a clean
// hook for future "hide this in the browser / show this in the app" rules.
//
// Note: safe-area insets themselves DON'T need this class — env(safe-area-*)
// is already 0 in a normal browser and only goes nonzero in full-bleed
// standalone, so offsets fold it in unconditionally. This class is for the
// cases where standalone needs genuinely different layout, not just padding.

function isStandalone() {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true,
  );
}

function apply() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("pwa-standalone", isStandalone());
}

if (typeof window !== "undefined") {
  apply();
  if (window.matchMedia) {
    const mq = window.matchMedia("(display-mode: standalone)");
    if (mq.addEventListener) mq.addEventListener("change", apply);
  }
}
