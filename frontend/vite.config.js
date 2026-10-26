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

const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Swap the share/SEO tags of a copy of index.html. Every tag must exist —
// a renamed tag fails the build instead of shipping the front page's card.
function withMeta(base, m) {
  const set = (html, re, value) => {
    if (!re.test(html)) throw new Error(`[pullup-pages] index.html is missing ${re}`);
    return html.replace(re, (_, pre) => `${pre}${attr(value)}"`);
  };
  let html = base.replace(/<title>[^<]*<\/title>/, `<title>${attr(m.title)}</title>`);
  html = set(html, /(<meta name="title" content=")[^"]*"/, m.title);
  html = set(html, /(<meta name="description" content=")[^"]*"/, m.description);
  html = set(html, /(<link rel="canonical" href=")[^"]*"/, m.url);
  html = set(html, /(<meta property="og:url" content=")[^"]*"/, m.url);
  html = set(html, /(<meta property="og:type" content=")[^"]*"/, m.type || "website");
  html = set(html, /(<meta property="og:title" content=")[^"]*"/, m.title);
  html = set(html, /(<meta property="og:description" content=")[^"]*"/, m.description);
  html = set(html, /(<meta name="twitter:title" content=")[^"]*"/, m.title);
  html = set(html, /(<meta name="twitter:description" content=")[^"]*"/, m.description);
  if (m.image) {
    html = set(html, /(<meta property="og:image" content=")[^"]*"/, m.image);
    html = set(html, /(<meta property="og:image:secure_url" content=")[^"]*"/, m.image);
    html = set(html, /(<meta property="og:image:alt" content=")[^"]*"/, m.alt);
    html = set(html, /(<meta name="twitter:image" content=")[^"]*"/, m.image);
    html = set(html, /(<meta name="twitter:image:alt" content=")[^"]*"/, m.alt);
  }
  if (m.jsonLd) {
    // Replace the site's own structured data with the page's.
    html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, "");
    const ld = m.jsonLd.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n    ");
    html = html.replace("</head>", `    ${ld}\n  </head>`);
  }
  return html;
}

// The public pages, built as real HTML files (nginx serves /x from x.html
// via `$uri.html`):
//  1. Each case and /pullup get their own share tags — link previews don't
//     run JS, so without this every shared link showed the front page's card.
//  2. The pages are pre-rendered into them (src/entry-prerender.jsx), so
//     search engines and AI crawlers read the content, not an empty <div>.
//  3. app.html stays the bare shell: nginx falls back to it for every app
//     route (/admin, /e/…), so those never flash the front page.
// A page that fails to render ships as the bare shell, with a warning.
function pagesPlugin() {
  let outDir = null;
  let projectRoot = null;
  return {
    name: "pullup-pages",
    apply: "build",
    configResolved(cfg) {
      projectRoot = cfg.root;
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    async closeBundle() {
      const { CASE_SHARES } = await import("./src/components/agency/caseShare.js");
      const product = await import("./src/pages/productMeta.js");
      const root = outDir;
      const shell = readFileSync(join(root, "index.html"), "utf8");
      writeFileSync(join(root, "app.html"), shell);

      const pages = [
        { route: "/", file: "index.html", html: shell },
        {
          route: "/pullup",
          file: "pullup.html",
          html: withMeta(shell, {
            title: product.PRODUCT_TITLE, description: product.PRODUCT_DESCRIPTION, url: product.PRODUCT_URL, jsonLd: product.productJsonLd(),
          }),
        },
        ...CASE_SHARES.map((c) => ({
          route: `/work/${c.slug}`,
          file: `work/${c.slug}.html`,
          html: withMeta(shell, { title: c.pageTitle, description: c.description, url: c.url, type: "article", image: c.image, alt: c.alt }),
        })),
        ...["privacy", "terms", "cookies"].map((p) => ({ route: `/${p}`, file: `${p}.html`, html: shell })),
      ];

      const { createServer } = await import("vite");
      // Its own cacheDir: in the shared node_modules/.vite this production-mode
      // server pre-bundled React's production build into the cache the dev
      // server reads — every local build left :5173 blank with "jsxDEV is not
      // a function" (2026-10-26).
      const server = await createServer({
        configFile: false,
        root: projectRoot,
        mode: "production",
        cacheDir: "node_modules/.vite-prerender",
        plugins: [react()],
        server: { middlewareMode: true, hmr: false },
        appType: "custom",
        logLevel: "error",
      });
      mkdirSync(join(root, "work"), { recursive: true });
      try {
        const { render } = await server.ssrLoadModule("/src/entry-prerender.jsx");
        for (const page of pages) {
          let html = page.html;
          try {
            const body = await render(page.route);
            if (!html.includes('<div id="root"></div>')) throw new Error("no empty #root in index.html");
            html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
          } catch (err) {
            console.warn(`[pullup-pages] ${page.route} not pre-rendered: ${err.message}`);
          }
          writeFileSync(join(root, page.file), html);
        }
      } finally {
        await server.close();
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [envGuardPlugin(), react(), pagesPlugin()],
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
