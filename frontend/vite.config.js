import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

// Each case gets its own copy of index.html with its own share tags
// (dist/work/<slug>.html; nginx serves it for /work/<slug> via `$uri.html`).
// Link previews don't run JS, so without this every shared case showed the
// front page's first-person card. Text + images: src/components/agency/caseShare.js.
function caseSharePlugin() {
  let outDir = null;
  return {
    name: "pullup-case-share",
    apply: "build",
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    async closeBundle() {
      const { CASE_SHARES } = await import("./src/components/agency/caseShare.js");
      const root = outDir;
      const base = readFileSync(join(root, "index.html"), "utf8");
      const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      mkdirSync(join(root, "work"), { recursive: true });
      for (const c of CASE_SHARES) {
        const set = (html, re, value) => {
          if (!re.test(html)) throw new Error(`[pullup-case-share] index.html is missing ${re}`);
          return html.replace(re, (_, pre) => `${pre}${attr(value)}"`);
        };
        let html = base.replace(/<title>[^<]*<\/title>/, `<title>${attr(c.pageTitle)}</title>`);
        html = set(html, /(<meta name="title" content=")[^"]*"/, c.pageTitle);
        html = set(html, /(<meta name="description" content=")[^"]*"/, c.description);
        html = set(html, /(<link rel="canonical" href=")[^"]*"/, c.url);
        html = set(html, /(<meta property="og:url" content=")[^"]*"/, c.url);
        html = set(html, /(<meta property="og:type" content=")[^"]*"/, "article");
        html = set(html, /(<meta property="og:title" content=")[^"]*"/, c.pageTitle);
        html = set(html, /(<meta property="og:description" content=")[^"]*"/, c.description);
        html = set(html, /(<meta property="og:image" content=")[^"]*"/, c.image);
        html = set(html, /(<meta property="og:image:secure_url" content=")[^"]*"/, c.image);
        html = set(html, /(<meta property="og:image:alt" content=")[^"]*"/, c.alt);
        html = set(html, /(<meta name="twitter:title" content=")[^"]*"/, c.pageTitle);
        html = set(html, /(<meta name="twitter:description" content=")[^"]*"/, c.description);
        html = set(html, /(<meta name="twitter:image" content=")[^"]*"/, c.image);
        html = set(html, /(<meta name="twitter:image:alt" content=")[^"]*"/, c.alt);
        writeFileSync(join(root, "work", `${c.slug}.html`), html);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [envGuardPlugin(), react(), caseSharePlugin()],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: the framework + supabase + sentry change far
        // less often than app code, so returning visitors (and every visitor
        // after a deploy) reuse them from cache — only the small page chunks
        // re-download. Pages themselves split per-route via lazyPage().
        // Function form: the object form missed react-dom's deep imports
        // (react-dom/client), leaking 300KB of framework into the entry chunk.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase/")) return "supabase";
          if (id.includes("@sentry/")) return "sentry";
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return "vendor";
          return undefined; // other npm deps follow their importing page chunk
        },
      },
    },
  },
});
