// Route-level code-splitting helper. Every page becomes its own chunk so a
// guest opening /e/:slug downloads the event page — not the admin dashboards,
// CRM, planner and Stripe that used to ride along in one 1.8MB bundle.
//
// Chunk-load failures get ONE automatic reload per half-minute: a session that
// spans a deploy can request a chunk hash that no longer exists on the server
// (the service worker usually still has it; this is the belt-and-braces for
// browsers without it). The throttle stops a reload loop if the network is
// genuinely down.
import { lazy } from "react";

export function lazyPage(loader, exportName) {
  return lazy(() =>
    loader()
      .then((m) => (exportName ? { default: m[exportName] } : m))
      .catch((err) => {
        try {
          const last = Number(sessionStorage.getItem("pullup_chunk_reload") || 0);
          if (Date.now() - last > 30000) {
            sessionStorage.setItem("pullup_chunk_reload", String(Date.now()));
            window.location.reload();
          }
        } catch {
          /* sessionStorage unavailable — just surface the error */
        }
        throw err;
      }),
  );
}
