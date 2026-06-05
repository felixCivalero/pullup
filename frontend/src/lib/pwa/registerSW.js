// Registers the service worker in production only.
//
// Dev is left alone on purpose: a caching SW during `vite dev` fights HMR and
// serves stale modules. We also guard the update flow against reload loops —
// when a new worker takes control we reload exactly once.

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // When an updated worker is installed alongside an active one, activate
        // it immediately so users aren't stuck on a stale bundle.
        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          if (!incoming) return;
          incoming.addEventListener("statechange", () => {
            if (incoming.state === "installed" && navigator.serviceWorker.controller) {
              incoming.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch(() => {
        // A failed SW registration must never break the app — degrade silently.
      });

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
