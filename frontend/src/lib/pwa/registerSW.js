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
    // Was the page already controlled by a SW when it loaded? If NOT, the first
    // `controllerchange` is THIS worker taking control for the first time
    // (clients.claim() in the SW's activate) — that is NOT an update. Reloading
    // there double-loads every fresh visit (first visit, incognito, post
    // cache-clear) and yanks the page back to top mid-scroll. We only want to
    // reload when an update REPLACES an already-active controller.
    const hadControllerAtLoad = !!navigator.serviceWorker.controller;

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
      // Initial control acquisition on a fresh visit — not an update. Skip it,
      // or we'd reload a page that just finished loading.
      if (!hadControllerAtLoad) return;
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
