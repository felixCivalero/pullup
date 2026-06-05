// PullUp service worker — runtime caching for an instant-opening app shell.
//
// Deliberately hand-rolled (no Workbox / vite-plugin-pwa): Vite hashes asset
// filenames at build time, so a static precache list would rot on every deploy.
// Runtime caching sidesteps that — we cache what actually gets fetched, keyed
// by the hashed URL, so a new deploy simply caches new URLs and the old ones
// age out. No build-step coupling, nothing to regenerate.
//
// Scope of what we touch, on purpose:
//   • navigations (HTML)      → network-first w/ timeout, fall back to cache
//   • same-origin static assets → stale-while-revalidate
//   • EVERYTHING ELSE          → passed straight through, untouched
// That last line is load-bearing: API calls (/api/*), tracking pixels (/t/*),
// uploads, webhooks, and all cross-origin requests are XHR/fetch — not
// navigations and not asset GETs — so they never enter the cache. Auth and
// live data are never served stale.

const VERSION = "v1";
const SHELL_CACHE = `pullup-shell-${VERSION}`;
const ASSET_CACHE = `pullup-assets-${VERSION}`;
const NAV_TIMEOUT_MS = 3000;

// Asset types safe to serve stale-while-revalidate. Hashed by Vite, so a stale
// hit is always a correct hit — the URL changes when the content changes.
const ASSET_DESTINATIONS = new Set(["script", "style", "font", "image", "worker"]);

self.addEventListener("install", (event) => {
  // Pre-warm the shell so the very first offline/flaky load still boots the SPA.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add("/")).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("pullup-") && k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Let the page tell a waiting worker to take over immediately (update flow).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch same-origin GETs. Cross-origin, POST/PUT/etc. pass through.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Belt-and-suspenders: never cache the API or tracking/upload rails even
  // though they aren't navigations — keeps stale auth/data impossible.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/t/") ||
    url.pathname.startsWith("/m/") ||
    url.pathname.startsWith("/webhooks/")
  ) {
    return;
  }

  // HTML navigations: try the network briefly (fresh wins), fall back to the
  // cached shell so a flaky/offline open still renders instantly.
  if (request.mode === "navigate") {
    event.respondWith(navigationStrategy(request));
    return;
  }

  // Static assets: serve from cache immediately, revalidate in the background.
  if (ASSET_DESTINATIONS.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function navigationStrategy(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const network = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    // Cache the shell under "/" so any route's offline fallback boots the SPA.
    cache.put("/", network.clone()).catch(() => {});
    return network;
  } catch {
    return (await cache.match("/")) || (await cache.match(request)) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
