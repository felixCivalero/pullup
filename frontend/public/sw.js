// Retired service worker. pullup.se used to install one for the PullUp app.
// Browsers that still have it registered fetch this file on their next visit;
// it clears every cache it made, unregisters itself and reloads open tabs so
// they get the live site straight from the network. Keep this file at /sw.js
// for a while so old installs find it.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const tabs = await self.clients.matchAll({ type: "window" });
      tabs.forEach((tab) => tab.navigate(tab.url));
    })(),
  );
});
