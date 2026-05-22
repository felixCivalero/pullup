// Centralized env resolution for the frontend bundle.
//
// Why this exists: on 2026-05-22 a developer-laptop `vite build` shipped a
// bundle where every API call pointed at http://localhost:3001 because the
// local .env had VITE_NODE_ENV=development. The dev-mode fallback was
// silently baked into the production bundle. This module makes that class
// of mistake impossible by hard-failing the *build* (Vite tree-shakes
// import.meta.env into string literals, so a throw at module top-level
// during build OR first script load surfaces the problem loudly).
//
// All four prior API/FRONTEND_URL declarations across the codebase should
// import from here instead of reading import.meta.env directly.

const DEV_API_FALLBACK = "http://localhost:3001";
const DEV_FRONTEND_FALLBACK = "http://localhost:5173";

function isLocalhostUrl(url) {
  if (!url || typeof url !== "string") return false;
  return (
    url.startsWith("http://localhost") ||
    url.startsWith("https://localhost") ||
    url.includes("127.0.0.1") ||
    url.startsWith("http://0.0.0.0")
  );
}

function resolveApiBase() {
  const explicit = import.meta.env.VITE_API_URL;
  if (import.meta.env.PROD) {
    if (!explicit) {
      throw new Error(
        "[env] VITE_API_URL must be set for production builds. " +
          "Add it to frontend/.env.production (the file is checked in).",
      );
    }
    if (isLocalhostUrl(explicit)) {
      throw new Error(
        `[env] VITE_API_URL points to localhost in a production build: ${explicit}. ` +
          "Refusing to ship a bundle that won't work in prod.",
      );
    }
    return explicit;
  }
  return explicit || DEV_API_FALLBACK;
}

function resolveFrontendBase() {
  const explicit = import.meta.env.VITE_FRONTEND_URL;
  if (import.meta.env.PROD) {
    if (!explicit) {
      throw new Error(
        "[env] VITE_FRONTEND_URL must be set for production builds. " +
          "Add it to frontend/.env.production.",
      );
    }
    if (isLocalhostUrl(explicit)) {
      throw new Error(
        `[env] VITE_FRONTEND_URL points to localhost in a production build: ${explicit}.`,
      );
    }
    return explicit;
  }
  // In dev, prefer the real browser origin (lets devs hit the app on a
  // LAN IP / phone without VITE_FRONTEND_URL being set).
  if (typeof window !== "undefined" && window.location?.origin) {
    return explicit || window.location.origin;
  }
  return explicit || DEV_FRONTEND_FALLBACK;
}

export const API_BASE = resolveApiBase();
export const FRONTEND_BASE = resolveFrontendBase();
// IS_DEV is exported for legacy call sites that branch on dev/prod for
// purposes other than URL resolution (e.g. logging verbosity). For URL
// choices, prefer API_BASE / FRONTEND_BASE which already handle the dev
// fallback.
export const IS_DEV = !!import.meta.env.DEV;
