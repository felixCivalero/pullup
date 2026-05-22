import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Build-time guard: a production build (`vite build`) must have a real
// VITE_API_URL that doesn't point at localhost. Same class of mistake we
// hit on 2026-05-22 — a dev's local .env had VITE_NODE_ENV=development,
// the dev fallback was baked into the bundle, and every API call from
// prod went to the dev's laptop.
//
// Runtime guards live in src/lib/env.js too, but this fails the BUILD
// itself so a broken bundle never reaches `dist/`.
function envGuardPlugin() {
  return {
    name: "pullup-env-guard",
    config(_config, { command, mode }) {
      if (command !== "build") return;
      const env = loadEnv(mode, process.cwd(), "");
      const url = env.VITE_API_URL;
      const looksLikeLocalhost =
        !!url &&
        (url.startsWith("http://localhost") ||
          url.startsWith("https://localhost") ||
          url.includes("127.0.0.1") ||
          url.startsWith("http://0.0.0.0"));

      if (!url) {
        throw new Error(
          `[pullup-env-guard] VITE_API_URL is not set for "${mode}" build.\n` +
            "  Add it to frontend/.env.production (or whichever .env.<mode> file applies).\n" +
            "  This guard exists because 2026-05-22 we shipped a bundle that\n" +
            "  pointed every API call at http://localhost:3001.",
        );
      }
      if (looksLikeLocalhost) {
        throw new Error(
          `[pullup-env-guard] VITE_API_URL=${url} looks like a dev URL but we're running a ${mode} build.\n` +
            "  Refusing to produce a bundle that won't work in production.",
        );
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [envGuardPlugin(), react()],
});
